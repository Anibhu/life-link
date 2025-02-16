// Middleware to check if user is authenticated
export function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) {
        return next();
    }
    req.session.redirectTo = req.originalUrl;
    res.redirect('/login');
}

// Function to sanitize search queries to prevent SQL Injection
export function sanitizeQuery(query) {
    if (!query) return "";
    return query.replace(/[^a-zA-Z0-9 ,]/g, ""); // Removes any special characters except spaces and commas
}
