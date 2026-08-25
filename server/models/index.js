import mongoose from 'mongoose'

const { Schema, model } = mongoose

// OAuth token subdocument (per provider, per user).
const TokenSchema = new Schema(
  {
    accessToken: String,
    refreshToken: String,
    expiry: Number, // epoch ms
  },
  { _id: false },
)

// A user of the app.
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    name: String,
    passwordHash: { type: String, required: true },
    // OAuth tokens for calendar providers (stored per-user).
    google: TokenSchema,
    outlook: TokenSchema,
    // Web Push subscriptions (one per browser/device the student enabled).
    pushSubs: { type: [Schema.Types.Mixed], default: [] },
    // SMS reminder preferences.
    phone: String,
    smsEnabled: { type: Boolean, default: false },
    // Saved Canvas calendar-feed URL + the student's timezone (for scheduled
    // re-sync, which has no browser to read the timezone from).
    canvasFeedUrl: String,
    tz: String,
  },
  { timestamps: true },
)

// A course, tied to an uploaded syllabus and owned by a user.
const CourseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true }, // e.g. "CS 101"
    term: String, // e.g. "Fall 2026"
    file: { filename: String, mime: String },
    parseStatus: {
      type: String,
      enum: ['queued', 'eating', 'scanning', 'done', 'error'],
      default: 'queued',
    },
  },
  { timestamps: true },
)

// A single parsed calendar event.
const EventSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    courseName: String, // denormalized label for display
    type: {
      type: String,
      enum: ['reading', 'homework', 'quiz', 'exam', 'project', 'study', 'other', 'assignment'],
      default: 'other',
    },
    label: String, // custom label for the 'other' type
    externalUid: { type: String, index: true }, // UID from an imported .ics (dedupe)
    due: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    approved: { type: Boolean, default: false },
    // committed=false means "parsed, awaiting the student's approval". The
    // account calendar/reminders only show committed events.
    committed: { type: Boolean, default: true },
    done: { type: Boolean, default: false }, // student checked it off
    reminded: { type: Boolean, default: false }, // a push reminder was sent
    confidence: Number,
    source: { page: Number, snippet: String, method: String },
  },
  { timestamps: true },
)

export const User = model('User', UserSchema)
export const Course = model('Course', CourseSchema)
export const Event = model('Event', EventSchema)
