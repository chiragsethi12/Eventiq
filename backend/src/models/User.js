import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ['attendee', 'organizer', 'admin'],
      default: 'attendee'
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
      }
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
      }
    }
  }
);

export const User = models.User || model('User', userSchema);

export default User;
