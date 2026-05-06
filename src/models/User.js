import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    avatar: { type: String, default: 'N' },
    walletBalance: { type: Number, default: 0 },
    credits: { type: Number, default: 1000 }
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
