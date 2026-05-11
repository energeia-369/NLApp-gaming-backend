import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { Play } from './models/Play.js';
import { User } from './models/User.js';
import { WalletTransaction } from './models/WalletTransaction.js';
import { fetchGameCatalog } from './services/gameCatalog.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/nlgamezone';
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const gamesApiUrl = process.env.GAMES_API_URL || 'https://www.freetogame.com/api/games';
const demoUsername = 'NXL_Vaibhav';
const legacyDemoUsername = 'NXL_Player';
const defaultCredits = 1000;

function allowClientOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (clientOrigins.includes(origin)) return callback(null, true);

  try {
    const url = new URL(origin);
    if (['localhost', '127.0.0.1'].includes(url.hostname)) return callback(null, true);
  } catch {
    return callback(null, false);
  }

  return callback(null, false);
}

app.use(cors({ origin: allowClientOrigin }));
app.use(express.json());

async function ensureDemoUser() {
  const currentUser = await User.findOne({ username: demoUsername });
  if (currentUser) {
    if ([8750, 5000].includes(currentUser.credits)) {
      currentUser.credits = defaultCredits;
      currentUser.walletBalance = 0;
      await currentUser.save();
    }
    return currentUser;
  }

  const legacyUser = await User.findOne({ username: legacyDemoUsername });
  if (legacyUser) {
    legacyUser.username = demoUsername;
    legacyUser.avatar = 'N';
    if ([8750, 5000].includes(legacyUser.credits)) legacyUser.credits = defaultCredits;
    await legacyUser.save();
    await Promise.all([
      Play.updateMany({ userId: legacyUser._id, username: legacyDemoUsername }, { $set: { username: demoUsername } }),
      WalletTransaction.updateMany({ userId: legacyUser._id, username: legacyDemoUsername }, { $set: { username: demoUsername } })
    ]);
    return legacyUser;
  }

  return User.create({ username: demoUsername, avatar: 'N', walletBalance: 0, credits: defaultCredits });
}

async function seedDemoData() {
  const count = await Play.countDocuments({ result: { $ne: 'playing' } });
  if (count > 0) return;

  const user = await ensureDemoUser();
  const rivals = [
    { username: 'NeonMVP', avatar: 'N', score: 9850, reward: 900 },
    { username: 'PulseQueen', avatar: 'P', score: 8720, reward: 540 },
    { username: 'ArcadeAce', avatar: 'A', score: 7410, reward: 360 },
    { username: demoUsername, avatar: user.avatar, score: 3240, reward: 0 },
    { username: 'SpinLord', avatar: 'S', score: 2980, reward: 0 }
  ];

  const users = await Promise.all(
    rivals.map((rival) =>
      User.findOneAndUpdate(
        { username: rival.username },
        { $setOnInsert: { username: rival.username, avatar: rival.avatar, walletBalance: 0, credits: defaultCredits } },
        { new: true, upsert: true }
      )
    )
  );

  const now = Date.now();
  await Play.insertMany(
    users.map((seedUser, index) => ({
      userId: seedUser._id,
      username: seedUser.username,
      gameId: 'lucky-spin',
      gameName: 'Lucky Spin',
      gameIcon: 'TOUR',
      entryFee: [500, 300, 200, 100, 50][index],
      score: rivals[index].score,
      reward: rivals[index].reward,
      result: 'completed',
      durationSeconds: 20,
      completedAt: new Date(now - index * 1000 * 60 * 33)
    }))
  );
}

function randomBonusPercent() {
  return Math.floor(Math.random() * 6) + 5;
}

async function recordWalletTransaction({ user, amount, purchaseAmount, bonusAmount = 0, bonusPercent = 0, type, provider, label, balanceAfter, play }) {
  return WalletTransaction.create({
    userId: user._id,
    playId: play?._id,
    username: user.username,
    amount,
    purchaseAmount,
    bonusAmount,
    bonusPercent,
    type,
    provider,
    gameId: play?.gameId,
    gameName: play?.gameName,
    gameIcon: play?.gameIcon,
    label,
    balanceAfter
  });
}

function weekStart() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.get('/api/me', async (_req, res, next) => {
  try {
    const user = await ensureDemoUser();
    res.json(user);
  } catch (error) {
    next(error);
  }
});

app.post('/api/wallet/add', async (req, res, next) => {
  try {
    const body = req.body || {};
    const amount = Number(body.amount || 100);
    const allowedAmounts = [100, 200, 500, 1000];
    const provider = ['upi', 'razorpay', 'add'].includes(body.provider) ? body.provider : 'add';
    if (!allowedAmounts.includes(amount)) return res.status(400).json({ message: 'Choose a valid token amount.' });

    const user = await ensureDemoUser();
    const bonusPercent = randomBonusPercent();
    const bonusAmount = Math.round((amount * bonusPercent) / 100);
    const creditedAmount = amount + bonusAmount;
    user.credits = Math.round((user.credits || 0) + creditedAmount);
    user.walletBalance = 0;
    await user.save();

    const transaction = await recordWalletTransaction({
      user,
      amount: creditedAmount,
      purchaseAmount: amount,
      bonusAmount,
      bonusPercent,
      type: 'credit_add',
      provider,
      label: `${provider.toUpperCase()} NXT credit add + ${bonusPercent}% bonus`,
      balanceAfter: user.credits
    });
    res.json({ user, transaction, creditedAmount, bonusAmount, bonusPercent });
  } catch (error) {
    next(error);
  }
});

app.get('/api/wallet/history', async (_req, res, next) => {
  try {
    const user = await ensureDemoUser();
    const rows = await WalletTransaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/games', async (_req, res) => {
  const catalog = await fetchGameCatalog(gamesApiUrl);
  res.json(catalog);
});

app.post('/api/plays/start', async (req, res, next) => {
  try {
    const { gameId, gameName, gameIcon, entryFee } = req.body;
    const fee = Number(entryFee);
    if (!gameId || !gameName || !Number.isFinite(fee) || fee <= 0) {
      return res.status(400).json({ message: 'Game and valid entry fee are required.' });
    }

    const user = await ensureDemoUser();
    if (user.credits < fee) {
      return res.status(402).json({ message: 'Insufficient NXT tokens. Add NXT credits to continue.' });
    }

    user.credits = Math.round(user.credits - fee);
    user.walletBalance = 0;
    await user.save();

    const play = await Play.create({
      userId: user._id,
      username: user.username,
      gameId,
      gameName,
      gameIcon,
      entryFee: fee
    });

    await recordWalletTransaction({
      user,
      play,
      amount: -fee,
      type: 'entry_fee',
      provider: 'game',
      label: `${gameName} tournament entry`,
      balanceAfter: user.credits
    });

    res.status(201).json({ play, user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/plays/:id/complete', async (req, res, next) => {
  try {
    const score = Math.max(0, Math.round(Number(req.body.score || 0)));
    const durationSeconds = Math.max(0, Math.round(Number(req.body.durationSeconds || 0)));
    const play = await Play.findById(req.params.id);
    if (!play) return res.status(404).json({ message: 'Play session not found.' });
    if (play.result !== 'playing') return res.status(409).json({ message: 'Play session is already complete.' });

    const betterScores = await Play.countDocuments({
      gameId: play.gameId,
      result: { $ne: 'playing' },
      score: { $gt: score },
      completedAt: { $gte: weekStart() }
    });
    const rank = betterScores + 1;
    const tournamentPrize = rank <= 3 ? Math.round(play.entryFee * 1.8) : 0;

    play.score = score;
    play.durationSeconds = durationSeconds;
    play.reward = tournamentPrize;
    play.result = 'completed';
    play.completedAt = new Date();
    await play.save();

    const user = await User.findById(play.userId);
    if (user && tournamentPrize > 0) {
      user.credits = Math.round((user.credits || 0) + tournamentPrize);
      user.walletBalance = 0;
      await user.save();
      await recordWalletTransaction({
        user,
        play,
        amount: tournamentPrize,
        type: 'reward',
        provider: 'reward',
        label: `${play.gameName} tournament prize`,
        balanceAfter: user.credits
      });
    }

    res.json({ play, user, rank, tournamentPrize });
  } catch (error) {
    next(error);
  }
});

app.get('/api/history', async (_req, res, next) => {
  try {
    const user = await ensureDemoUser();
    const plays = await Play.find({ userId: user._id, result: { $ne: 'playing' } }).sort({ completedAt: -1 }).limit(50);
    res.json(plays);
  } catch (error) {
    next(error);
  }
});

app.get('/api/leaderboard', async (req, res, next) => {
  try {
    const gameId = req.query.gameId;
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const match = { result: { $ne: 'playing' }, completedAt: { $gte: since } };
    if (gameId) match.gameId = gameId;

    const rows = await Play.aggregate([
      { $match: match },
      {
        $group: {
          _id: { username: '$username', gameId: '$gameId' },
          username: { $first: '$username' },
          gameName: { $first: '$gameName' },
          gameIcon: { $first: '$gameIcon' },
          score: { $max: '$score' },
          entryFee: { $max: '$entryFee' },
          plays: { $sum: 1 },
          lastPlayed: { $max: '$completedAt' }
        }
      },
      { $sort: { gameName: 1, score: -1, lastPlayed: 1 } }
    ]);

    const rankedRows = [];
    const byGame = new Map();
    rows.forEach((row) => {
      const key = gameId ? 'selected' : row._id.gameId;
      const bucket = byGame.get(key) || [];
      bucket.push(row);
      byGame.set(key, bucket);
    });

    byGame.forEach((bucket) => {
      bucket
        .sort((a, b) => b.score - a.score || new Date(a.lastPlayed) - new Date(b.lastPlayed))
        .slice(0, 3)
        .forEach((row, index) => {
          rankedRows.push({
            ...row,
            rank: index + 1,
            tournamentPrize: Math.round((row.entryFee || 0) * 1.8),
            prizeLabel: 'Weekly MVP pool'
          });
        });
    });

    res.json(rankedRows);
  } catch (error) {
    next(error);
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, '../client/dist');
const serveClient = fs.existsSync(clientDistPath);

if (serveClient) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: error.message || 'Server error' });
});

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await seedDemoData();
  console.log(`MongoDB connected: ${mongoUri}`);
  app.listen(port, () => console.log(`NL Game Zone API running on http://localhost:${port}`));
} catch (error) {
  console.error('\nMongoDB connection failed.');
  console.error(`Tried: ${mongoUri}`);
  console.error('Start MongoDB on port 27017, then run: npm run dev');
  console.error('Windows admin PowerShell: Start-Service MongoDB');
  console.error(`Original error: ${error.message}\n`);
  process.exit(1);
}
