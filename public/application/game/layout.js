define(function(require) {
	'use strict';
	var Backbone = require('backbone');
	var Marionette = require('backbone.marionette');
	var template = require('tpl!game/templates/layout.html');
	var achievementTemplate = require('tpl!game/templates/achievement.html');

	return Marionette.View.extend({
		template: template,

		regions: {
			achievementsLocation: '#achievements'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options)
		},

		onRender: function()
		{
			var playerId = this.getOption('playerId');

			var achievements = new Backbone.Collection(this.model.get('achievements'), {
				comparator: function(achievement) {
					return -achievement.get('percent');
				}
			});
			achievements.sort();

			this.showChildView('achievementsLocation', new Marionette.NextCollectionView({
				className: 'achievement-list',
				collection: achievements,
				childView: Marionette.View.extend({
					serializeData: function()
					{
						var data = Marionette.View.prototype.serializeData.call(this);

						data.unlocked = !!data.players[playerId];

						return data;
					}
				}),
				childViewOptions: {
					template: achievementTemplate
				}
			}));
		}
	});
});