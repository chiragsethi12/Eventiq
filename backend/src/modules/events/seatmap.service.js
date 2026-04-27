import Seat from '../../models/Seat.js';
import SeatMap from '../../models/SeatMap.js';
import { APIError } from '../../utils/apiError.js';

const MAX_ROWS = 26;
const MAX_COLUMNS = 200;
const MAX_SEATS = 5000;

const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const normalizePositiveInteger = (value, field, max) => {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new APIError(400, 'EVENT_INVALID_SEATMAP', `${field} must be an integer from 1 to ${max}`);
  }

  return number;
};

const normalizeSeatNumber = (value) => {
  if (typeof value !== 'string') {
    throw new APIError(400, 'EVENT_INVALID_SEAT', 'Seat numbers must be strings');
  }

  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z][1-9][0-9]*$/.test(normalized)) {
    throw new APIError(400, 'EVENT_INVALID_SEAT', 'Invalid seat number');
  }

  return normalized;
};

const normalizeSeatNumberArray = (value, field) => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new APIError(400, 'EVENT_INVALID_SEAT', `${field} must be an array`);
  }

  return [...new Set(value.map(normalizeSeatNumber))];
};

const normalizeOptionalSeatCount = (value) => {
  if (value === undefined) {
    return undefined;
  }

  const seatCount = Number(value);

  if (!Number.isInteger(seatCount) || seatCount < 1) {
    throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', 'seatCount must be a positive integer');
  }

  return seatCount;
};

const rowIndex = (row) => rowLetters.indexOf(row);

const normalizeRow = (value, field) => {
  if (typeof value !== 'string') {
    throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', `${field} must be a row letter`);
  }

  const normalized = value.trim().toUpperCase();

  if (!rowLetters.includes(normalized)) {
    throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', `${field} must be between A and Z`);
  }

  return normalized;
};

const getTierRowRange = (tierConfig) => {
  const startRow = tierConfig.rowStart ?? tierConfig.fromRow ?? tierConfig.startRow;
  const endRow = tierConfig.rowEnd ?? tierConfig.toRow ?? tierConfig.endRow;

  if (startRow === undefined && endRow === undefined) {
    return null;
  }

  if (startRow === undefined || endRow === undefined) {
    throw new APIError(
      400,
      'EVENT_INVALID_TIER_CONFIG',
      'Tier row ranges require both start and end rows'
    );
  }

  const normalizedStart = normalizeRow(startRow, 'rowStart');
  const normalizedEnd = normalizeRow(endRow, 'rowEnd');

  if (rowIndex(normalizedStart) > rowIndex(normalizedEnd)) {
    throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', 'Tier rowStart must be before rowEnd');
  }

  return { start: normalizedStart, end: normalizedEnd };
};

const getTierColumnRange = (tierConfig, columns) => {
  const start = tierConfig.columnStart ?? tierConfig.fromColumn ?? tierConfig.startColumn ?? 1;
  const end = tierConfig.columnEnd ?? tierConfig.toColumn ?? tierConfig.endColumn ?? columns;
  const normalizedStart = normalizePositiveInteger(start, 'columnStart', columns);
  const normalizedEnd = normalizePositiveInteger(end, 'columnEnd', columns);

  if (normalizedStart > normalizedEnd) {
    throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', 'columnStart must be before columnEnd');
  }

  return { start: normalizedStart, end: normalizedEnd };
};

const buildSeatNumbers = ({ rows, columns, blockedSeats }) => {
  const blockedSeatSet = new Set(blockedSeats);
  const seats = [];

  for (let rowIndexValue = 0; rowIndexValue < rows; rowIndexValue += 1) {
    const rowLetter = rowLetters[rowIndexValue];

    for (let column = 1; column <= columns; column += 1) {
      const seatNumber = `${rowLetter}${column}`;

      if (!blockedSeatSet.has(seatNumber)) {
        seats.push(seatNumber);
      }
    }
  }

  return seats;
};

const assertSeatExists = (seatNumber, allSeatsSet) => {
  if (!allSeatsSet.has(seatNumber)) {
    throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', `Seat ${seatNumber} is not in the seat map`);
  }
};

const seatNumbersForTier = ({ tierConfig, rows, columns, allSeatsSet }) => {
  const explicitSeats = normalizeSeatNumberArray(tierConfig.seatNumbers, 'seatNumbers');

  if (explicitSeats.length > 0) {
    explicitSeats.forEach((seatNumber) => assertSeatExists(seatNumber, allSeatsSet));
    return explicitSeats;
  }

  const explicitRows = tierConfig.rows;

  if (explicitRows !== undefined) {
    if (!Array.isArray(explicitRows) || explicitRows.length === 0) {
      throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', 'Tier rows must be a non-empty array');
    }

    const normalizedRows = [...new Set(explicitRows.map((row) => normalizeRow(row, 'rows')))];
    const columnRange = getTierColumnRange(tierConfig, columns);

    return normalizedRows.flatMap((row) => {
      if (rowIndex(row) >= rows) {
        throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', `Row ${row} is not in the seat map`);
      }

      const seats = [];

      for (let column = columnRange.start; column <= columnRange.end; column += 1) {
        const seatNumber = `${row}${column}`;

        if (allSeatsSet.has(seatNumber)) {
          seats.push(seatNumber);
        }
      }

      return seats;
    });
  }

  const rowRange = getTierRowRange(tierConfig);

  if (!rowRange) {
    throw new APIError(
      400,
      'EVENT_INVALID_TIER_CONFIG',
      'Each tier must define seatNumbers, rows, or a rowStart/rowEnd range'
    );
  }

  const columnRange = getTierColumnRange(tierConfig, columns);
  const seats = [];

  for (let index = rowIndex(rowRange.start); index <= rowIndex(rowRange.end); index += 1) {
    if (index >= rows) {
      throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', 'Tier row range exceeds seat map rows');
    }

    const row = rowLetters[index];

    for (let column = columnRange.start; column <= columnRange.end; column += 1) {
      const seatNumber = `${row}${column}`;

      if (allSeatsSet.has(seatNumber)) {
        seats.push(seatNumber);
      }
    }
  }

  return seats;
};

const buildTierSeatAssignments = ({ seatNumbers, tierConfigs, tierIds, rows, columns }) => {
  const allSeatsSet = new Set(seatNumbers);
  const assignments = new Map();
  const tierSeatCounts = new Map();
  const remainingSeats = new Set(seatNumbers);

  tierConfigs.forEach((tierConfig, index) => {
    const tierId = tierIds[index].toString();
    const seatCount = normalizeOptionalSeatCount(
      tierConfig.seatCount ?? tierConfig.seats ?? tierConfig.count
    );
    const hasExplicitSeatRules =
      Array.isArray(tierConfig.seatNumbers) ||
      Array.isArray(tierConfig.rows) ||
      tierConfig.rowStart !== undefined ||
      tierConfig.fromRow !== undefined ||
      tierConfig.startRow !== undefined;

    if (seatCount !== undefined && hasExplicitSeatRules) {
      throw new APIError(
        400,
        'EVENT_INVALID_TIER_CONFIG',
        'A tier cannot mix seatCount with explicit seat assignments'
      );
    }

    const tierSeats =
      seatCount !== undefined
        ? seatNumbers.filter((seatNumber) => remainingSeats.has(seatNumber)).slice(0, seatCount)
        : seatNumbersForTier({ tierConfig, rows, columns, allSeatsSet });

    if (tierSeats.length === 0) {
      throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', 'Each ticket tier must include seats');
    }

    if (seatCount !== undefined && tierSeats.length !== seatCount) {
      throw new APIError(
        400,
        'EVENT_INVALID_TIER_CONFIG',
        'Ticket tiers cannot exceed the number of sellable seats'
      );
    }

    tierSeats.forEach((seatNumber) => {
      if (assignments.has(seatNumber)) {
        throw new APIError(400, 'EVENT_INVALID_TIER_CONFIG', `Seat ${seatNumber} is assigned twice`);
      }

      assignments.set(seatNumber, tierIds[index]);
      remainingSeats.delete(seatNumber);
    });

    tierSeatCounts.set(tierId, tierSeats.length);
  });

  return {
    assignments,
    tierSeatCounts,
    unassignedSeatNumbers: seatNumbers.filter((seatNumber) => remainingSeats.has(seatNumber))
  };
};

export const normalizeSeatMapConfig = (payload) => {
  const source = payload?.seatMap && typeof payload.seatMap === 'object' ? payload.seatMap : payload;
  const rows = normalizePositiveInteger(source?.rows, 'rows', MAX_ROWS);
  const columns = normalizePositiveInteger(source?.columns, 'columns', MAX_COLUMNS);
  const blockedSeats = normalizeSeatNumberArray(source?.blockedSeats, 'blockedSeats');

  if (rows * columns > MAX_SEATS) {
    throw new APIError(400, 'EVENT_SEATMAP_TOO_LARGE', `Seat map cannot exceed ${MAX_SEATS} seats`);
  }

  const validSeats = new Set(buildSeatNumbers({ rows, columns, blockedSeats: [] }));

  blockedSeats.forEach((seatNumber) => assertSeatExists(seatNumber, validSeats));

  return { rows, columns, blockedSeats };
};

export const createSeatMapAndSeats = async ({
  eventId,
  rows,
  columns,
  blockedSeats,
  tierConfigs,
  tierIds,
  session
}) => {
  const seatNumbers = buildSeatNumbers({ rows, columns, blockedSeats });

  if (seatNumbers.length === 0) {
    throw new APIError(400, 'EVENT_INVALID_SEATMAP', 'Seat map must include at least one sellable seat');
  }

  const { assignments, tierSeatCounts, unassignedSeatNumbers } = buildTierSeatAssignments({
    seatNumbers,
    tierConfigs,
    tierIds,
    rows,
    columns
  });
  const effectiveBlockedSeats = [...new Set([...blockedSeats, ...unassignedSeatNumbers])];

  const [seatMap] = session
    ? await SeatMap.create(
        [{ eventId, rows, columns, blockedSeats: effectiveBlockedSeats }],
        { session }
      )
    : await SeatMap.create([{ eventId, rows, columns, blockedSeats: effectiveBlockedSeats }]);

  const seats = [...assignments.entries()].map(([seatNumber, tierId]) => ({
    eventId,
    seatNumber,
    tierId,
    status: 'available'
  }));

  await Seat.insertMany(seats, session ? { session, ordered: true } : { ordered: true });

  return {
    seatMap,
    tierSeatCounts,
    totalSeats: seats.length
  };
};

export const deleteSeatMapForEvent = async (eventId, { session } = {}) => {
  if (session) {
    await Seat.deleteMany({ eventId }).session(session);
    await SeatMap.deleteMany({ eventId }).session(session);
    return;
  }

  await Promise.all([
    Seat.deleteMany({ eventId }),
    SeatMap.deleteMany({ eventId })
  ]);
};

export const seatmapService = {
  createSeatMapAndSeats,
  deleteSeatMapForEvent,
  normalizeSeatMapConfig
};
