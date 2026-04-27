import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const ticketSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true
    },
    seats: {
      type: [String],
      required: true,
      default: []
    },
    qrPayload: {
      type: String,
      required: true
    },
    qrImageUrl: {
      type: String,
      required: true
    },
    isUsed: {
      type: Boolean,
      default: false
    },
    usedAt: {
      type: Date
    }
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false
    }
  }
);

export const Ticket = models.Ticket || model('Ticket', ticketSchema);

export default Ticket;
