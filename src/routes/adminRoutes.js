const express = require('express');
const { categories, periods } = require('../controllers/adminController');
const router = express.Router();
for (const [path, handlers] of [['/categories', categories], ['/periodes', periods]]) { router.get(path, handlers.list); router.post(path, handlers.create); router.put(`${path}/:id`, handlers.update); router.delete(`${path}/:id`, handlers.remove); }
module.exports = router;
