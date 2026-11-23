import mongoose, { Connection } from 'mongoose';

// set mongoose Promise to Bluebird
mongoose.Promise = Promise;
// Exit application on error
mongoose.connection.on('error', (err) => {
    console.log(`MongoDB connection error: ${err}`)
    process.exit(-1);
});

/**
 * Connect to mongo db
 *
 * @returns {object} Mongoose connection
 * @public
 */
const connect = async (uri: string): Promise<Connection> => {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');
    return mongoose.connection;
};

export default connect;
