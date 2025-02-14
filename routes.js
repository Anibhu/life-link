import express from 'express';
import pool from './database.js';

const router = express.Router();

router.get('/', (req, res) => {
    res.render('index.ejs', { 
        isLoggedIn: req.session.isLoggedIn || false, 
        username: req.session.username || '',
        user: req.session.user || {}
    });
});

router.get('/registration', (req, res) => {
    res.render("pages/registration.ejs");
});

router.post('/registration', async (req, res) => {
    const { name, age, contact, address, email, password, bloodgroup, gender } = req.body;

    try {
        const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).send("Email already in use");
        }

        await pool.query(
            "INSERT INTO users (name, age, contact, address, email, password, bloodgroup, gender) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [name, age, contact, address, email, password, bloodgroup, gender]
        );

        res.redirect('/login');
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).send("Server Error");
    }
});


router.get('/login', (req, res) => {
    res.render('pages/login');    
})

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (result.rows.length === 0 || result.rows[0].password !== password) {
            return res.redirect('/?error=invalid');
        }

        // Store user info in session
        req.session.isLoggedIn = true;
        req.session.email = email;
        req.session.username = result.rows[0].name;

        res.redirect('/');
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server Error");
    }
});



router.post("/request", async (req, res) => {
    try {
        const { name, organ, contact_number, email, location } = req.body;

        if (!name || !organ || !contact_number || !email || !location) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const query = `INSERT INTO organ_recipient (name, organ_part, contact_number, email, location) 
                       VALUES ($1, $2, $3, $4, $5) RETURNING *`; // Use $1, $2, ... for PostgreSQL
        const values = [name, organ, contact_number, email, location];

        const result = await pool.query(query, values); // Use pool.query() directly
        if (organ.toLowerCase() === "blood") {
            return res.redirect("/blood/all");
        }
        res.status(201).json({ message: "Request submitted successfully", data: result.rows[0] });
    } catch (error) {
        console.error("Error inserting data:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.get('/dashboard', async (req, res) => {
    if (!req.session.email) {
        return res.redirect('/login'); // Redirect if not logged in
    }

    try {
        // Fetch user data from 'users' table
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [req.session.email]);

        // Fetch recipient data from 'organ_recipient' table
        const recipientResult = await pool.query('SELECT * FROM organ_recipient WHERE email = $1', [req.session.email]);

        // Check if user exists
        if (userResult.rows.length === 0) {
            return res.send('User not found');
        }

        // Extract data
        const user = userResult.rows[0];
        const recipient = recipientResult.rows.length > 0 ? recipientResult.rows[0] : null;

        // Render dashboard with both user and recipient data
        res.render('pages/dashboard', { user, recipient });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching user data');
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
    res.render("pages/organ");
});

router.get('/tissue', (req,res) => {
    res.send("Welcome to the tissue page");
});

router.get('*', (req,res) => {
    res.render('pages/page_not_found');
});

export default router;