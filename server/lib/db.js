import mongoose from 'mongoose'

/**
 * Connect to MongoDB. Returns the mongoose connection. Callers should await
 * this before starting the HTTP server so requests never hit a cold DB.
 */
export async function connectMongo(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Copy .env.example to .env and point it at a ' +
        'local mongod or a MongoDB Atlas cluster.',
    )
  }
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
  // eslint-disable-next-line no-console
  console.log('▸ MongoDB connected')
  return mongoose.connection
}
