/* ================= tile editor: heights =================
   The map model's heights (editor/model.js): elevation 0..MAX_ELEV, upper floors 1..MAX_LEVEL, each floor STOREY
   height levels above the ground under it. Kept apart so the town view's ground painter, which runs in a worker
   (town/ground-worker.js), can use them without bringing in the rest of the model. */
const MAX_ELEV = 6, MAX_LEVEL = 3, STOREY = 2;

export { MAX_ELEV, MAX_LEVEL, STOREY };
