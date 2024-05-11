const mongoose = require('mongoose');

const TeamSchema = mongoose.Schema({
    teamName: {type: String, required: true},
    players: {type:[String], required: true},
    captain: {type: String, required: true},
    viceCaptain: {type: String, required: true},
});

const Team=mongoose.model('team', TeamSchema);
module.exports=Team;