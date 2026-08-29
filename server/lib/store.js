/**
 * Store facade. Selects a backend at boot:
 *   - MongoDB (store.mongo.js) when MONGODB_URI is set and reachable — data persists.
 *   - In-memory (store.memory.js) otherwise — so the app still runs for local
 *     testing without MongoDB installed (data resets on restart).
 *
 * Call initStore() once before serving requests. All other exports delegate to
 * whichever backend was chosen.
 */
import * as mongoImpl from './store.mongo.js'
import * as memImpl from './store.memory.js'
import { connectMongo } from './db.js'

let impl = memImpl
let mode = 'memory'

export async function initStore() {
  if (process.env.MONGODB_URI) {
    try {
      await connectMongo()
      impl = mongoImpl
      mode = 'mongo'
      return mode
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `⚠  MongoDB unavailable — falling back to IN-MEMORY store (data resets on ` +
          `restart, not for production). Reason: ${e.message}`,
      )
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      '⚠  MONGODB_URI not set — using IN-MEMORY store (data resets on restart). ' +
        'Set MONGODB_URI in .env to persist accounts and events.',
    )
  }
  impl = memImpl
  mode = 'memory'
  return mode
}

export const storeMode = () => mode

// --- delegated API (identical signatures across both backends) ---
export const findUserByEmail = (...a) => impl.findUserByEmail(...a)
export const createUser = (...a) => impl.createUser(...a)
export const getUserById = (...a) => impl.getUserById(...a)
export const createCourse = (...a) => impl.createCourse(...a)
export const setCourseStatus = (...a) => impl.setCourseStatus(...a)
export const getCourse = (...a) => impl.getCourse(...a)
export const setCourseName = (...a) => impl.setCourseName(...a)
export const addEvents = (...a) => impl.addEvents(...a)
export const eventsForCourse = (...a) => impl.eventsForCourse(...a)
export const approvedEventsForCourse = (...a) => impl.approvedEventsForCourse(...a)
export const allEventsForUser = (...a) => impl.allEventsForUser(...a)
export const commitCourse = (...a) => impl.commitCourse(...a)
export const importEvents = (...a) => impl.importEvents(...a)
export const setCanvasFeed = (...a) => impl.setCanvasFeed(...a)
export const setCanvasSynced = (...a) => impl.setCanvasSynced(...a)
export const clearCanvasFeed = (...a) => impl.clearCanvasFeed(...a)
export const getOrCreateCourse = (...a) => impl.getOrCreateCourse(...a)
export const usersWithCanvas = (...a) => impl.usersWithCanvas(...a)
export const setStudyPrefs = (...a) => impl.setStudyPrefs(...a)
export const clearPlanEvents = (...a) => impl.clearPlanEvents(...a)
export const addPlanEvents = (...a) => impl.addPlanEvents(...a)
export const updateEvent = (...a) => impl.updateEvent(...a)
export const deleteEvent = (...a) => impl.deleteEvent(...a)
export const approveAll = (...a) => impl.approveAll(...a)
export const saveTokens = (...a) => impl.saveTokens(...a)
export const getTokens = (...a) => impl.getTokens(...a)
export const savePushSub = (...a) => impl.savePushSub(...a)
export const removePushSub = (...a) => impl.removePushSub(...a)
export const getPushSubs = (...a) => impl.getPushSubs(...a)
export const setReminderPrefs = (...a) => impl.setReminderPrefs(...a)
export const dueSoonUnreminded = (...a) => impl.dueSoonUnreminded(...a)
export const markReminded = (...a) => impl.markReminded(...a)
