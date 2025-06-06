import express from 'express';
import pool from './database.js';
import { isAuthenticated, sanitizeQuery } from './utils.js';

const router = express.Router();

function getCompatibleBloodGroups(bloodgroup) {
    const compatibilityMap = {
        "A+": ["A+", "A-", "O+", "O-"],
        "A-": ["A-", "O-"],
        "B+": ["B+", "B-", "O+", "O-"],
        "B-": ["B-", "O-"],
        "AB+": ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
        "AB-": ["A-", "B-", "O-", "AB-"],
        "O+": ["O+", "O-"],
        "O-": ["O-"]
    };
    return compatibilityMap[bloodgroup] || null;
}

router.get('/', (req, res) => {
    res.render('index.ejs', { 
        isLoggedIn: req.session.isLoggedIn || false, 
        username: req.session.username || '',
        user: req.session.user || {}
    });
});

router.get('/registration', (req, res) => {
    res.render('pages/registration', { error: req.query.error || '' });
});

router.post('/registration', async (req, res) => {
    const { name, age, contact, address, email, password, confirmPassword, bloodgroup, gender } = req.body;

    if (password !== confirmPassword) {
        return res.render('pages/registration', { error: 'Passwords do not match' });
    }

    try {
        const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userExists.rows.length > 0) {
            return res.render('pages/registration', { error: 'Email already in use' });
        }

        await pool.query(
            "INSERT INTO users (name, age, contact, address, email, password, bloodgroup, gender) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [name, age, contact, address, email, password, bloodgroup, gender]
        );

        res.redirect('/login');
    } catch (error) {
        res.render('pages/registration', { error: 'Server error, please try again later' });
    }
});

router.get("/login", (req, res) => {
    res.render("pages/login", { 
        isLoggedIn: req.session.isLoggedIn || false, 
        username: req.session.username || ""
    });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (result.rows.length === 0) {
            return res.render('pages/login', { error: 'Email not registered' });
        }

        const user = result.rows[0];

        if (user.password !== password) {
            return res.render('pages/login', { error: 'Incorrect password' });
        }

        req.session.isLoggedIn = true;
        req.session.email = email;
        req.session.username = user.name;

        const redirectTo = req.session.redirectTo || '/';
        delete req.session.redirectTo;

        res.redirect(redirectTo);
    } catch (err) {
        res.status(500).render("pages/error", { error: "Internal server error. Please try again later." });
    }
});

router.post("/request", isAuthenticated, async (req, res) => {
    try {
        const { name, organ, contact_number, email, location, bloodgroup } = req.body;

        if (!name || !organ || !contact_number || !email || !location || !bloodgroup) {
            return res.status(500).render("pages/error", { error: "Missing required fields" });
        }

        const query = `INSERT INTO organ_recipient (name, organ_part, contact_number, email, location, bloodgroup) 
                       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
        const values = [name, organ, contact_number, email, location, bloodgroup];

        const result = await pool.query(query, values);

        if (organ.toLowerCase() === "blood") {
            const compatibleBloodGroups = getCompatibleBloodGroups(bloodgroup);

            if (!compatibleBloodGroups) {
                return res.status(500).render("pages/error", { error: "Invalid blood group provided" });
            }

            const queryParams = new URLSearchParams({
                location: location,
                bloodgroups: compatibleBloodGroups.join(",")
            });

            return res.redirect(`/blood/search?query=${queryParams.toString()}`);
        } 
        
        return res.redirect("/hospitals");

    } catch (error) {
        res.status(500).render("pages/error", { error: "Internal server error" });
    }
});

router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [req.session.email]);
        const recipientResult = await pool.query('SELECT * FROM organ_recipient WHERE email = $1', [req.session.email]);

        if (userResult.rows.length === 0) {
            return res.send('User not found');
        }
        const user = userResult.rows[0];
        const recipient = recipientResult.rows.length > 0 ? recipientResult.rows[0] : null;

        res.render('pages/profile', { user, recipient });
    } catch (err) {
        res.status(500).render("pages/error", { error: "Error fetching user data" });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/profile');
        }
        res.redirect('/');
    });
});

router.get('/blood/all', async (req, res) => {
    try {
        const data = await pool.query("SELECT * FROM donors");
        if (!req.session.email) {  
            req.session.redirectTo = '/blood/all';
            return res.redirect('/login'); 
        }
        res.render('pages/blood_donor_list.ejs', { blood_donors : data.rows });
    } catch (error) {
        res.status(500).render("pages/error", { errorMessage: "Internal server error. Please try again later." });
    }
});

router.get('/blood/search', isAuthenticated, async (req, res) => {
    try {
        const { query } = req.query;
        let conditions = [];
        let values = [];
        let sql = `SELECT * FROM donors`;

        if (query) {
            const filters = query.split("&").map(term => term.trim());
            let fieldSearch = {};
            let generalSearch = [];
            let isAndSearch = query.includes('&');

            filters.forEach(term => {
                const match = term.match(/^([a-zA-Z0-9_]+)=(.+)$/);
                if (match) {
                    const key = match[1].toLowerCase();
                    let value = decodeURIComponent(match[2]);

                    // Handling specific fields
                    if (key === "bloodgroups") {
                        fieldSearch[key] = value.split(",").map(bg => bg.trim());
                    } else if (key === "pid") {
                        // If pid is in the query, directly add it to the conditions
                        fieldSearch[key] = value.trim();
                    } else {
                        fieldSearch[key] = [value];
                    }
                } else {
                    generalSearch.push(decodeURIComponent(term));
                }
            });

            // Add condition for "pid"
            if (fieldSearch.pid) {
                conditions.push(`"pid" = $${values.length + 1}`);
                values.push(fieldSearch.pid);
            }

            if (fieldSearch.location) {
                const locationConditions = fieldSearch.location.map((loc, index) => `"location" ILIKE $${values.length + index + 1}`);
                conditions.push(`(${locationConditions.join(isAndSearch ? ' AND ' : ' OR ')})`);
                values.push(...fieldSearch.location.map(loc => `%${sanitizeQuery(loc)}%`));
            }

            if (fieldSearch.bloodgroups && fieldSearch.bloodgroups.length > 0) {
                const bloodConditions = fieldSearch.bloodgroups.map((bg, index) => `$${values.length + index + 1}`);
                conditions.push(`"bloodgroup" IN (${bloodConditions.join(", ")})`);
                values.push(...fieldSearch.bloodgroups);
            }

            if (generalSearch.length > 0) {
                const generalConditions = generalSearch.map((term, index) => {
                    const placeholder = `$${values.length + index + 1}`;
                    return `("location" ILIKE ${placeholder} OR "bloodgroup" ILIKE ${placeholder} OR "name" ILIKE ${placeholder} OR "contact" ILIKE ${placeholder} OR "pid"::TEXT ILIKE ${placeholder})`;
                });
                conditions.push(`(${generalConditions.join(isAndSearch ? ' AND ' : ' OR ')})`);
                values.push(...generalSearch.map(term => `%${sanitizeQuery(term)}%`));
            }

            sql += ` WHERE ${conditions.join(isAndSearch ? ' AND ' : ' OR ')}`;
        } else {
            sql += ` ORDER BY pid LIMIT 50`;
        }

        const { rows } = await pool.query(sql, values);
        res.render('pages/blood_donor_list', { blood_donors: rows });

    } catch (error) {
        res.status(500).render('pages/error', { error: "Error fetching blood donors" });
    }
});


router.get('/organs', isAuthenticated, (req, res) => {
    res.render("pages/organ");
});

router.get('/donor_registration', isAuthenticated, (req, res) => {
    res.render('pages/donor_registration');
});

router.post('/donor_registration', isAuthenticated, async (req, res) => {
    const { name, age, bloodgroup, location, contact, organ } = req.body;

    try {
        if (organ && organ.includes("Blood")) {
            const query = "INSERT INTO donors (name, age, bloodgroup, location, contact) VALUES ($1, $2, $3, $4, $5) RETURNING pid";
            const result = await pool.query(query, [name, age, bloodgroup, location, contact]);
            const pid = result.rows[0].pid;
            res.render('pages/success', { 
                message: "Your donation has been successfully registered.",
                redirectUrl: `/blood/search?query=pid=${pid}`
            });
        }
        

        const organs = organ;
        const insertQuery = `
            INSERT INTO organ_donor (name, age, bloodgroup, location, contact, organs)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await pool.query(insertQuery, [name, age, bloodgroup, location, contact, organs]);

        res.render("pages/registration_success", {
            name,
            age,
            location,
            contact,
            organs: organs.join(", ")  // Displaying organs as a comma-separated list for readability
        });
    } catch (err) {
        res.status(500).render("pages/error", { error: "Error registering donor" });
    }
});



router.get("/hospitals", isAuthenticated, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM hospitals");
        res.render("pages/hospitals", { hospitals: result.rows });
    } catch (error) {
        res.status(500).render("pages/error", { error: "Internal server error. Please try again later." });
    }
});

router.post("/hospitals/request", isAuthenticated, async (req, res) => {
    try {
        const { serial_no, hospital_email } = req.body;
        const userEmail = req.session.email;

        if (!serial_no || !hospital_email) {
            return res.status(400).json({ success: false, error: "Missing serial_no or hospital_email" });
        }

        const userResult = await pool.query("SELECT * FROM organ_recipient WHERE email = $1", [userEmail]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: "User data not found" });
        }

        const userData = userResult.rows[0];

        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

router.get('/health_check', (req, res) => {
    res.status(200).send("<h2>Service is running smoothly ✅</h2>");
});

router.use((req, res) => {
    res.status(404).render('pages/error', { error: "404 - Page Not Found" });
});

export default router;