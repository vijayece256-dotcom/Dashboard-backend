import { Schema, model } from 'mongoose';

interface TaskTicketCounter {
  _id: string;
  sequence: number;
}

const taskTicketCounterSchema = new Schema<TaskTicketCounter>({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true },
}, { versionKey: false });

export const TaskTicketCounterModel = model<TaskTicketCounter>(
  'tl_task_ticket_counter',
  taskTicketCounterSchema,
  'tl_task_ticket_counter',
);
