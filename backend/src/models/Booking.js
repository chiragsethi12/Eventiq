import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const bookingSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true
    },
    seats: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Seat' }],
      default: []
    },
    tierId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'refund_pending'],
      default: 'pending',
      index: true
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    razorpayPaymentId: {
      type: String,
      trim: true
    },
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket'
    }
  },
  { timestamps: true }
);

bookingSchema.index({ userId: 1, eventId: 1 });
bookingSchema.index({ userId: 1, paymentStatus: 1, createdAt: -1 });
bookingSchema.index({ userId: 1, eventId: 1, paymentStatus: 1, createdAt: -1 });

export const Booking = models.Booking || model('Booking', bookingSchema);

export default Booking;
