import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const ticketTierSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    totalSeats: {
      type: Number,
      required: true,
      min: 0
    },
    availableSeats: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: true }
);

const eventSchema = new Schema(
  {
    organizerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    venue: {
      name: {
        type: String,
        required: true,
        trim: true
      },
      city: {
        type: String,
        required: true,
        trim: true
      },
      address: {
        type: String,
        required: true,
        trim: true
      }
    },
    date: {
      type: Date,
      required: true,
      index: true
    },
    category: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    coverImageUrl: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled'],
      default: 'published',
      index: true
    },
    seatMapId: {
      type: Schema.Types.ObjectId,
      ref: 'SeatMap'
    },
    ticketTiers: {
      type: [ticketTierSchema],
      default: []
    }
  },
  { timestamps: true }
);

eventSchema.index({ status: 1, date: 1, _id: 1 });
eventSchema.index({ status: 1, category: 1, date: 1, _id: 1 });
eventSchema.index({ status: 1, 'venue.city': 1, date: 1, _id: 1 });
eventSchema.index({ organizerId: 1, date: 1 });
eventSchema.index({ organizerId: 1, status: 1 });
eventSchema.index({ organizerId: 1, date: -1 });
eventSchema.index({ date: 1, status: 1 });

export const Event = models.Event || model('Event', eventSchema);

export default Event;
