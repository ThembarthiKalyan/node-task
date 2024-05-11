const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const _ = require("lodash");
const port = 3000;
const app = express();
app.use(bodyParser());

const matchData = require('./data/match.json');
const playerData = require('./data/players.json');
const Team = require('./model/team.model');

const DB_USER = process.env['DB_USER'];
const DB_PWD = process.env['DB_PWD'];
const DB_URL = process.env['DB_URL'];
const DB_NAME = "task-dream11";

const uri = "mongodb+srv://"+DB_USER+":"+DB_PWD+"@"+DB_URL+"/?retryWrites=true&w=majority";

mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
}).catch((err) => console.log(err.message));

// End points
app.post('/add-team', async (req, res) => {
    try {
        const body = req.body;
        if (!body || !body.teamName || !(body.players && body.players.length === 11) || !body.captain || !body.viceCaptain) {
            return res.status(400).send({ success: false, message: "Please send valid details" })
        }
        let players = body.players

        //As mentioned in readme file player and match data is directly taken from JSON file, not saved in DB, only formed team is saved in DB
        let playerRequired = [];
        _.forEach(playerData, (obj) => {
            if (_.includes(players, obj.Player)) {
                playerRequired.push(obj);
            }
        })

        // checking all given players are there or not in players.json file
        if (playerRequired.length !== players.length) {
            return res.status(400).send({ success: false, message: "Please send valid player list" })
        }

        // checking captain and vice captain are there or not in players.json file
        if (!(_.includes(players, body.captain) && _.includes(players, body.viceCaptain))) {
            return res.status(400).send({ success: false, message: "Please send valid captain / vice captain " })
        }

        //checking if minimum number of wicket keeper, batter, bowler, all rounders
        let playerType = _.groupBy(playerRequired, player => player.Role);
        if (!playerType.WICKETKEEPER) {
            return res.status(400).send({ success: false, message: "Please select valid wicket keepers in team" })
        } if (!playerType.BOWLER) {
            return res.status(400).send({ success: false, message: "Please select valid bowlers in team" })
        } if (!playerType.BATTER) {
            return res.status(400).send({ success: false, message: "Please select valid batter in team" })
        } if (!playerType.ALL_ROUNDER) {
            return res.status(400).send({ success: false, message: "Please select valid all rounders in team" })
        }
        if (playerType.BOWLER && playerType.BOWLER.length < 1 && playerType.BOWLER.length > 8) {
            return res.status(400).send({ success: false, message: "Please select valid bowlers in team" })
        } if (playerType.BATTER && playerType.BATTER.length < 1 && playerType.BATTER.length > 8) {
            return res.status(400).send({ success: false, message: "Please select valid batters in team" })
        } if (playerType.ALL_ROUNDER && playerType.ALL_ROUNDER.length < 1 && playerType.ALL_ROUNDER.length > 8) {
            return res.status(400).send({ success: false, message: "Please select valid all rounders in team" })
        } if (playerType.WICKETKEEPER && playerType.WICKETKEEPER.length < 1 && playerType.WICKETKEEPER.length > 8) {
            return res.status(400).send({ success: false, message: "Please select valid wicket keepers in team" })
        }

        //checking maximum of 10 players can be selected from any one of the teams
        let playerTeams = _.groupBy(playerRequired, player => player.Team);
        let teams = Object.keys(playerTeams).length;
        if (teams < 2) {
            return res.status(400).send({ success: false, message: "Please select atleast 1 player from both teams" });
        }

        let teamObject = {
            teamName: body.teamName,
            players: body.players,
            captain: body.captain,
            viceCaptain: body.viceCaptain
        }
        await Team.create(teamObject);

        res.status(200).send({ success: true, result: 'Team created successfully' });
    } catch (error) {
        res.status(400).send({ success: false, message: error.message });
    }
})

app.get('/process-result', async (req, res) => {
    try {
        let response = [];
        response = await Team.find().lean();
        if (response.length === 0) {
            return res.status(404).send({ success: false, message: "No team selected" });
        }
        let team = response[0];

        // Points calculation logic
        let data = calculatePoints(team);

        res.status(200).send({ success: true, points: data });

    } catch (error) {
        res.status(400).send({ success: false, message: error.message });
    }
})

app.get('/team-result', async(req,res)=>{
    try{
        let response = [];
        response = await Team.find().lean();
        if (response.length === 0) {
            return res.status(404).send({ success: false, message: "No team selected" });
        }
        let team = response[0];
        let data = calculatePoints(team);

        let points = Object.values(data);
        points.sort(function(a, b){return b - a});
        let topScore = points[0];
        let winners = [];
        _.forOwn(data, (value, key)=>{
            if(value === topScore){
                winners.push(key);
            }
        })
        data['Winner'] = winners.join(", ");

        // In data we have winner and all players individual scores
        res.status(200).send({ success: true, data });
         
    } catch (error) {
        res.status(400).send({ success: false, message: error.message });
    }
})

const calculatePoints = (team) => {
    //As mentioned in readme file player and match data is directly taken from JSON file, not saved in DB, only formed team is saved in DB
    let captain = team.captain;
    let viceCaptain = team.viceCaptain;
    let players = team.players
    let points = {};

    let battingPointObj = _.groupBy(matchData, obj => obj.batter);
    let bowlingPointObj = _.groupBy(matchData, obj => obj.bowler);
    let fieldingPointObj = _.groupBy(matchData, obj => obj.fielders_involved);

    _.forEach(players, (player) => {
        let totalPoints = 0;
        let battingPoints = 0;
        let bowlingPoints = 0;
        let fieldingPoints = 0;

        if (battingPointObj[player]) {
            // batting points calculation
            let actualCount = 0;
            let bonusCount = 0;
            let playerScoreObj = battingPointObj[player];
            let pointGroup = _.groupBy(playerScoreObj, obj => obj.batsman_run);
            _.forOwn(pointGroup, (value, key) => {
                actualCount += (Number(key) * value.length);
            });

            // bonus calculation
            if (actualCount >= 100) {
                bonusCount += 16
            } else if (actualCount >= 50) {
                bonusCount += 8
            } else if (actualCount >= 30) {
                bonusCount += 4
            }

            // bonus calculation for 6's and 4's
            let keys = _.keys(pointGroup);
            let sortedKeys = keys.sort().reverse();
            _.forEach(sortedKeys, (key) => {
                if (bonusCount === 0 && key === '6') {
                    let value = pointGroup[key];
                    bonusCount += (2 * (value.length));
                    return false
                } else if (bonusCount === 0 && key === '4') {
                    let value = pointGroup[key];
                    bonusCount += (1 * (value.length));
                    return false
                }
            })

            // duck out
            let duckGroup = _.groupBy(playerScoreObj, (obj) => obj.kind)
            let notBowler = false;
            let dataObj = _.groupBy(playerData, obj => obj.Player);
            let playerJSON = dataObj[player];
            if (playerJSON.Role === "BATTER" || playerJSON.Role === "ALL_ROUNDER" || playerJSON.Role === "WICKETKEEPER") {
                notBowler = true
            }
            if (actualCount === 0 && duckGroup && duckGroup.bowled && notBowler) {
                bonusCount -= 2
            }
            battingPoints = battingPoints + actualCount + bonusCount
        }

        if (bowlingPointObj[player]) {
            // bowling points calculation
            let actualCount = 0;
            let bonusCount = 0;
            let wicketCount = 0;
            let allScore = bowlingPointObj[player];
            let wicketGroup = _.groupBy(allScore, obj => obj.kind);
            delete wicketGroup.NA;
            if (wicketGroup) {
                _.forOwn(wicketGroup, (value, key) => {
                    if (key === "caught" || key === "caught and bowled") {
                        actualCount += 25 * (value.length)
                    }
                    if (key === "bowled" || key === "lbw") {
                        actualCount += 8 * (value.length)
                        wicketCount += 1
                    }
                })

                //3, 4, 5 wicket bonus calculation
                if (wicketCount >= 5) {
                    bonusCount += (wicketCount * 16)
                } else if (wicketCount === 4) {
                    bonusCount += (wicketCount * 8)
                } else if (wicketCount === 3) {
                    bonusCount += (wicketCount * 4)
                }

            }

            //maiden calcualation
            let overGroup = _.groupBy(allScore, obj => obj.overs);
            _.forOwn(overGroup, (value, key) => {
                let overScores = value
                let count = 0;
                _.forEach(overScores, (obj) => {
                    count += obj.batsman_run
                })
                if (count === 0) {
                    bonusCount += 12
                }
            })
            bowlingPoints = bowlingPoints + actualCount + bonusCount
        }

        if (fieldingPointObj[player]) {
            // fielding points calculation
            let fieldingPoints = 0;
            let field = fieldingPointObj[player];
            let catchCount = 0;
            _.forEach(field, (obj) => {
                if (obj.kind === 'caught') {
                    fieldingPoints += 8
                    catchCount += 1
                } else if (obj, kind === 'stumped') {
                    fieldingPoints += 12
                } else {
                    fieldingPoints += 6
                }
            })
            if (catchCount >= 3) {
                let threeCatch = parseInt(catchCount / 3);
                fieldingPoints += (threeCatch * 4)
            }
        }

        totalPoints = battingPoints + bowlingPoints + fieldingPoints;
        if (player === captain) {
            totalPoints *= 2
        } if (player === viceCaptain) {
            totalPoints *= 1.5
        }
        points[player] = totalPoints;
    })

    return points;

}

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});



