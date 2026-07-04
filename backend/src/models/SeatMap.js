import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const seatMapSchema = new Schema({
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
    index: true
  },
  rows: {
    type: Number,
    required: true,
    min: 1
  },
  columns: {
    type: Number,
    required: true,
    min: 1
  },
  blockedSeats: {
    type: [String],
    default: []
  }
},
{ timestamps: true });

export const SeatMap = models.SeatMap || model('SeatMap', seatMapSchema);

export default SeatMap;
