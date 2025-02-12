import dotenv from 'dotenv';
import express from 'express';
import router from './routes.js';
import bodyParser from 'body-parser';
import pool from './database.js'
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('views', './views');
app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, "public")));


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

const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use('/', router);

app.listen(PORT, ()=> console.log(`Server Running at port ${PORT}`));

