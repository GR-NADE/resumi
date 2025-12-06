import mongoose from 'mongoose';

const connectDB = async () => {
    try
    {
        const options = {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };

        const conn = await mongoose.connect(process.env.MONGODB_URI, options);
        console.log(`MongiDB Connected: ${conn.connection.host}`);
        console.log(`Database: ${conn.connection.name}`);
    }
    catch (error)
    {
        console.error(`Database connection error: ${error.message}`);
        process.exit(1);
    }
};

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error(`MongoDB connection error: ${err}`);
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
});

process.on('SIGINT', async () => {
    try
    {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    }
    catch (err)
    {
        console.error('Error during MongoDB disconnection:', err);
        process.exit(1);
    }
});

export default connectDB;