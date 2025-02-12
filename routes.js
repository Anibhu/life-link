import express from 'express';
import pool from './database.js';

const router = express.Router();

router.get('/', (req,res) => {
    res.render("index.ejs");
});

router.get('/blood', (req,res) => {
    res.render("blood.ejs");
});

router.get('/blood/all', async (req, res) => {
    try {
        const data = await pool.query("SELECT * FROM donors");
        res.render('pages/blood_donor_list.ejs', { blood_donors : data.rows});

    } catch (error) {
        console.log(error);
        res.status(500).send("Server Error");
    }
})

router.get('/blood/search', async (req, res) => {
    try {
        const { query } = req.query;

        if (!query) {
            return res.render('pages/blood_donor_list', { blood_donors: [] });
        }

        const searchTerms = query.split(',').map(term => term.trim()); // Split by comma & trim spaces

        let sql = `SELECT * FROM donors WHERE `;
        let conditions = [];
        let values = [];

        searchTerms.forEach((term, index) => {
            const placeholder = `$${index + 1}`;
            conditions.push(`
                "Blood Group" ILIKE ${placeholder} 
                OR "location" ILIKE ${placeholder} 
                OR "Donor Name" ILIKE ${placeholder} 
                OR CAST("age" AS TEXT) ILIKE ${placeholder} 
                OR "contact" ILIKE ${placeholder} 
                OR CAST("Patient ID" AS TEXT) ILIKE ${placeholder}
            `);
            values.push(`%${term}%`);
        });

        sql += `(${conditions.join(" OR ")})`;

        const { rows } = await pool.query(sql, values);
        res.render('pages/blood_donor_list', { blood_donors: rows });

    } catch (error) {
        console.error("Error fetching donors:", error);
        res.status(500).send(error);
    }
});




router.get('/organs', (req,res) => {
    res.send("Welcome to the organs page");
});

router.get('/tissue', (req,res) => {
    res.send("Welcome to the tissue page");
});

export default router;