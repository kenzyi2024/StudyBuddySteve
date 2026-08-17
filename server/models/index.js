import mongoose from 'mongoose'

const { Schema, model } = mongoose

// A user of the app.
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: String,
    // OAuth tokens for calendar providers (encrypt at rest in production)
    google: { accessToken: String, refreshToken: String, expiry: Date },
    outlook: { accessToken: String, refreshToken: String, expiry: Date },
  },
  { timestamps: true },
)

// A single parsed calendar event (assignment / exam / deadline).
const EventSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['assignment', 'exam', 'quiz', 'reading', 'other'], default: 'other' },
    due: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    notes: String,
    // Provenance: where in the syllabus this was extracted from + confidence
    source: { page: Number, snippet: String, confidence: Number },
    approved: { type: Boolean, default: false },
  },
  { timestamps: true },
)

// A course, tied to an uploaded syllabus.
const CourseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    name: { type: String, required: true }, // e.g. "CS 101"
    term: String, // e.g. "Fall 2026"
    syllabusFile: { filename: String, storageKey: String, mime: String },
    parseStatus: {
      type: String,
      enum: ['queued', 'eating', 'scanning', 'done', 'error'],
      default: 'queued',
    },
  },
  { timestamps: true },
)

export const User = model('User', UserSchema)
export const Course = model('Course', CourseSchema)
export const Event = model('Event', EventSchema)
