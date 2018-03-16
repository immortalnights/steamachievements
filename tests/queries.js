// player game summary (total, played, perfected (todo), total playtime)
db.player_games.aggregate([ {
	$match: { 'playerId': '76561197993451745' }
}, {
	$group: {
		'_id': null,
		'total': {
			$sum: 1,
		},
		'played': {
			$sum: {
				$cond: { if: { $ne: [ '$playtime_forever', 0 ] }, then: 1, else: 0 }
			}
		},
		'unplayed': {
			$sum: {
				$cond: { if: { $eq: [ '$playtime_forever', 0 ] }, then: 1, else: 0 }
			}
		},
		'perfect': {
			$sum: {
				$cond: { if: { $eq: [ '$perfected', true ] }, then: 1, else: 0 }
			}
		},
		'totalPlaytime': {
			$sum: "$playtime_forever"
		}
	}
} ]);

// player game achievement summary (total, unlocked)
db.player_games.aggregate([ {
	$match: {
		'playerId': '76561197993451745',
		'achievements': { $type: 'array' }
	}
}, {
	$project: {
		_id: null,
		appid: 1,
		total: {
			$size: '$achievements'
		},
		unlocked: {
			$size: {
				$filter: {
					input: '$achievements',
					as: 'achievement',
					cond: { $ne: ['$$achievement.achieved', 0 ] }
				}
			}
		}
	}
}, {
	$group: {
		_id: null,
		total: {
			$sum: '$total',
		},
		unlocked: {
			$sum: '$unlocked'
		}
	}
} ])

// player game completion rating
db.player_games.aggregate([ {
	$match: {
		'playerId': '76561197993451745',
		'playtime_forever': { $ne: 0 },
		'achievements': { $type: 'array' }
	}
}, {
	$project: {
		_id: null,
		appid: 1,
		name: 1,
		total: 1,
		unlocked: 1,
		img_icon_url: 1,
		img_logo_url: 1,
		total: {
			$size: '$achievements'
		},
		unlocked: {
			$size: {
				$filter: {
					input: '$achievements',
					as: 'achievement',
					cond: { $ne: ['$$achievement.achieved', 0 ] }
				}
			}
		},
	}
}, {
	$addFields: {
		percentage: {
			$multiply: [{
				$divide: [ '$unlocked', '$total' ]
			}, 100 ]
		}
	}
}, {
	$match: { $and: [ { 'percentage': { $ne: 100 } } , { 'percentage': { $ne: 0 } } ] }
}, {
	$sort: { 'percentage': -1 }
}, {
	$limit : 10
} ]);

// player game completion 2
db.player_achievements.aggregate([ {
	$match: {
		playerId: "76561197993451745"
	}
}, {
	$group: {
		_id: '$appid',
		total: { $sum: 1 },
		unlocked: { $sum: '$achieved' }
	}
}, {
	$addFields: {
		percentage: {
			$multiply: [{
				$divide: [ '$unlocked', '$total' ]
			}, 100 ]
		}
	}
}, {
	$match: { $and: [ { 'percentage': { $ne: 100 } } , { 'percentage': { $ne: 0 } } ] }
}, {
	$sort: { 'percentage': -1 }
}, {
	$limit : 10
}, {
	$lookup: {
		from: 'player_games',
		let: {
			appid: '$_id'
		},
		pipeline: [{
			$match: {
				playerId: "76561197993451745",
				$expr: { $eq: [ "$appid", "$$appid"] }
			},
		}, {
			$project: {
				_id: 0,
				name: 1,
				img_icon_url: 1,
				img_logo_url: 1,
				playtime_forever: 1
			}
		}],
		as: 'schema'
	}
}, {
	$replaceRoot: { newRoot: { $mergeObjects: [ { $arrayElemAt: [ '$schema', 0 ] }, '$$ROOT' ] } }
}, {
	$project: { schema: 0 }
} ]).pretty()


db.player_games.aggregate([ {
	$match: {
		'playerId': '76561197993451745',
		'completed': { $ne: true },
		'achievements': { $type: 'array' }
	}
}, {
	$lookup: {
		from: 'games',
		localField: 'appid',
		foreignField: '_id',
		as: 'schema'
	}
}, {
	"$unwind": "$schema"
}, {
	$project: {
		_id: null,
		appid: 1,
		name: 1,
		total: 1,
		unlocked: 1,
		img_icon_url: 1,
		img_logo_url: 1,
		total: {
			$size: '$achievements'
		},
		totalGlobalPercentage: {
			$sum: '$schema.achievements.percent'
		}
	}
}, {
	$addFields: {
		globalPercentage: {
			$divide: [ '$totalGlobalPercentage', '$total' ]
		}
	}
}, {
	$project: {
		totalGlobalPercentage: 0
	}
}, {
	$sort: { 'percentage': -1 }
} ])

db.player_games.aggregate([ {
	$match: {
		'playerId': '76561197993451745',
		'completed': { $ne: true },
		'achievements': { $type: 'array' }
	}
}, {
	$project: {
		achieve: {
			$filter: {
				input: '$achievements',
				as: 'achievement',
				cond: { $eq: [ '$$achievement.unlocked', 0 ] }
			}
		}
	}
}, {
	$lookup: {
		from: 'games',
		let: {
			appid: '$appid',
			required: {
				$map: {
					input: '$achievements',
					as: 'achievement',
					in: '$$achievement.apiname'
				}
			}
		},
		pipeline: [{
			$match: {
				$expr: { $eq: [ "$_id", "$$appid"] }
			},
		}, {
			$project: {
				_id: null,
				achievements: 1
			}
		}],
		as: 'schema'
	}
}, {
	$unwind: '$schema'
}, {
	$project: {
		mergedAchievements: {
			$setUnion: [ '$achievements', '$schema.achievements' ]
		}
	}
}]).pretty();

db.player_achievements.aggregate([ {
	$match: {
		playerId: '76561197993451745',
		achieved: 0
	}
}, {
	$lookup: {
		from: 'game_achievements',
		let: {
			appid: '$appid',
			apiname: '$apiname'
		},
		pipeline: [{
			$match: {
				$expr: {
					$and: [
						{ $eq: [ '$appid', '$$appid' ] },
						{ $eq: [ '$name', '$$apiname' ] }
					]
				}
			}
		}, {
			$project: {
				_id: 0,
				displayName: 1,
				description: 1,
				icon: 1,
				icongray: 1,
				percent: 1
			}
		}],
		as: 'schema'
	}
}, {
	$sort: { 'schema.percent': -1 }
}, {
	$limit: 10
}]).pretty();


db.game_achievements.aggregate([ {
	$lookup: {
		from: 'player_achievements',
		let: {
			appid: '$appid',
			name: '$name'
		},
		pipeline: [{
			$match: {
				$expr: {
					$and: [
						{ $eq: [ '$playerId', '76561197993451745' ] },
						{ $eq: [ '$achieved', 0 ] },
						{ $eq: [ '$appid', '$$appid' ] },
						{ $eq: [ '$apiname', '$$name' ] }
					]
				}
			}
		}],
		as: 'player_achievement'
	}
},{
	$sort: { 'percent': -1 }
}, {
	$limit: 10
}, {
	$lookup: {
		from: 'games',
		// localField: 'appid',
		// foreignField: '_id',
		let: {
			appid: '$appid'
		},
		pipeline: [{
			$match: {
				$expr: { $eq: [ '$_id', '$$appid' ] } 
			}
		}, {
			$project: {
				achievements: 0,
				stats: 0
			}
		}],
		as: 'schema'
	}
}]).pretty();

db.player_achievements.aggregate([ {
	$lookup: {
		from: 'game_achievements',
		let: {
			appid: '$appid',
			name: '$apiname'
		},
		pipeline: [{
			$match: {
				$expr: {
					$and: [
						{ $eq: [ '$appid', '$$appid' ] },
						{ $eq: [ '$name', '$$name' ] }
					]
				}
			}
		}],
		as: 'schema'
	}
}]).pretty();




// , {
// 			$project: {
// 				_id: 0,
// 				displayName: 1,
// 				description: 1,
// 				icon: 1,
// 				icongray: 1,
// 				percent: 1
// 			}
// 		}