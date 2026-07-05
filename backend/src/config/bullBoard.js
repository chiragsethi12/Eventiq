import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue, reminderQueue, refundQueue } from './queue.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/v1/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(reminderQueue),
    new BullMQAdapter(refundQueue)
  ],
  serverAdapter
});

export const bullBoardRouter = serverAdapter.getRouter();

