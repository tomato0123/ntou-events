import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../src/database.js';
import { RegistrationService } from '../src/registrations.js';
const db = openDatabase(workerData.filename);
try {
  const registration = new RegistrationService(db, () => workerData.now).register(workerData.eventId, workerData.userId);
  parentPort.postMessage({ status: 201, registrationStatus: registration.status });
} catch (error) {
  parentPort.postMessage({ status: error.status || 500, code: error.code || error.message });
} finally { db.close(); }
