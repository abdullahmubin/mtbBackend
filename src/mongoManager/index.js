import mongoose from 'mongoose';
import 'dotenv/config'
import logger from '../utils/logger.js';

const connectionWithAtlas = () => {
    mongoose.connect(process.env.connectionString)
        .then(() => logger.info('MongoDB connected'));
}

export default connectionWithAtlas;