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
	$match: { 'percentage': { $ne: 100 } } 
}, {
	$sort: { 'percentage': -1 }
}, {
	$limit : 10
} ]);

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

, {
	$setUnion: [ '$achievements', '$schema.achievements']
}