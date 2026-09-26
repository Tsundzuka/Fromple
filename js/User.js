// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  company: { type: String, default: '' },
  stripeCustomerId: { type: String, default: null },
  stripeSubscriptionId: { type: String, default: null },
  plan: { 
    type: String, 
    enum: ['free', 'professional', 'growth'], 
    default: 'free' 
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'inactive', 'past_due', 'cancelled', 'cancelling'],
    default: 'inactive'
  },
  subscriptionStart: { type: Date, default: null },
  subscriptionEnd: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);