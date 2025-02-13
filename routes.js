import express from 'express';
import pool from './database.js';

const router = express.Router();

router.get('/', (req,res) => {
    res.render("index.ejs");
});

router.get('/registration', (req, res) => {
    res.render("pages/registration.ejs");
});

router.post('/register', async (req, res) => {
    const { name, age, contact, address, email, password, bloodgroup } = req.body;

    try {
        const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).send("Email already in use");
        }

        await pool.query(
            "INSERT INTO users (name, age, contact, address, email, password, bloodgroup) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [name, age, contact, address, email, password, bloodgroup]
        );

        res.redirect('/');
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).send("Server Error");
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (user.rows.length === 0) {
            return res.redirect('/?error=invalid'); // Redirect with error flag
        }

        if (user.rows[0].password !== password) {
            return res.redirect('/?error=invalid'); // Redirect with error flag
        }

        // Successful login - Redirect to dashboard
        res.redirect('/blood/all');
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
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

        const searchTerms = query.split(',').map(term => term.trim());

        let sql = `SELECT * FROM donors WHERE `;
        let conditions = [];
        let values = [];

        searchTerms.forEach((term, index) => {
            const placeholder = `$${index + 1}`;
            conditions.push(`
                "bloodgroup" ILIKE ${placeholder} 
                OR "location" ILIKE ${placeholder} 
                OR "name" ILIKE ${placeholder} 
                OR "age"::TEXT ILIKE ${placeholder} 
                OR "contact" ILIKE ${placeholder} 
                OR "pid"::TEXT ILIKE ${placeholder}
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

router.get('*', (req,res) => {
    res.render('pages/page_not_found');
});

export default router;