import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const seatSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true
    },
    seatNumber: {
      type: String,
      required: true,
      trim: true
    },
    tierId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    status: {
      type: String,
      enum: ['available', 'locked', 'booked'],
      default: 'available'
    },
    lockedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    lockExpiry: {
      type: Date
    },
    bookedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    }
  },
  { timestamps: true }
);

seatSchema.index({ eventId: 1, seatNumber: 1 }, { unique: true });
seatSchema.index({ eventId: 1, status: 1 });
seatSchema.index({ status: 1, lockExpiry: 1 });

export const Seat = models.Seat || model('Seat', seatSchema);

export default Seat;
