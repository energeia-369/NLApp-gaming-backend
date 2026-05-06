import mongoose from 'mongoose';

const playSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    username: { type: String, required: true },
    gameId: { type: String, required: true, index: true },
    gameName: { type: String, required: true },
    gameIcon: { type: String, default: '🎮' },
    entryFee: { type: Number, required: true },
    score: { type: Number, default: 0 },
    reward: { type: Number, default: 0 },
    result: { type: String, enum: ['completed', 'playing'], default: 'playing', index: true },
    durationSeconds: { type: Number, default: 0 },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

playSchema.index({ gameId: 1, score: -1, completedAt: -1 });

export const Play = mongoose.model('Play', playSchema);
