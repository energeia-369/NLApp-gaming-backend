import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    playId: { type: mongoose.Schema.Types.ObjectId, ref: 'Play' },
    username: { type: String, required: true },
    amount: { type: Number, required: true },
    purchaseAmount: { type: Number },
    bonusAmount: { type: Number, default: 0 },
    bonusPercent: { type: Number, default: 0 },
    type: { type: String, enum: ['credit_add', 'entry_fee', 'reward'], default: 'credit_add', index: true },
    provider: { type: String, enum: ['upi', 'razorpay', 'add', 'game', 'reward'], default: 'add' },
    gameId: { type: String },
    gameName: { type: String },
    gameIcon: { type: String },
    label: { type: String, default: 'Wallet top-up' },
    status: { type: String, enum: ['success', 'pending', 'failed'], default: 'success' },
    balanceAfter: { type: Number, required: true }
  },
  { timestamps: true }
);

walletTransactionSchema.index({ userId: 1, createdAt: -1 });
walletTransactionSchema.index({ playId: 1, type: 1 });

export const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
