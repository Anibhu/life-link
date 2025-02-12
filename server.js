import dotenv from 'dotenv';
import express from 'express';
import router from './routes.js';
import bodyParser from 'body-parser';
import pool from './database.js'

dotenv.config();

const app = express();

app.set('views', './views');  // Ensures Express looks in the correct folder
app.set('view engine', 'ejs'); // Sets EJS as the view engine


const connectDB = async () => {
    try{
        const client = await pool.connect();
        console.log("Connected to Database");
        client.release();
    }

    catch(err){
        console.log(err);
    }
}

connectDB();

const PORT = process.env.PORT;

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use('/', router);

app.listen(PORT, ()=> console.log(`Server Running at port ${PORT}`));