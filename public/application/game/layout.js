define(function(require) {
	'use strict';
	var Backbone = require('backbone');
	var Marionette = require('backbone.marionette');
	var template = require('tpl!game/templates/layout.html');
	var achievementTemplate = require('tpl!game/templates/achievement.html');

	return Marionette.View.extend({
		template: template,

		regions: {
			unlockedAchievementsLocation: '#unlockedachievements',
			lockedAchievementsLocation: '#lockedachievements'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options)
		},

		serializeData: function()
		{
			var data = Marionette.View.prototype.serializeData.call(this);

			data.unlockedCount = _.countBy(this.model.get('achievements'), function(achievement) {
				return !_.isEmpty(achievement.players);
			}).true;

			return data;
		},

		onRender: function()
		{
			var playerId = this.getOption('playerId');

			var achievements = new Backbone.Collection(this.model.get('achievements'));

			var unlocked = new Backbone.Collection(achievements.filter(function(achievement) {
				return !_.isEmpty(achievement.get('players'));
			}));
			unlocked.each(function(achievement) {
				achievement.set('unlocked', true);
			});
			// unlocked.sort();

			var locked = new Backbone.Collection(achievements.filter(function(achievement) {
				return _.isEmpty(achievement.get('players'));
			}), {
				comparator: function(achievement) {
					return -achievement.get('percent');
				}
			});
			locked.each(function(achievement) {
				achievement.set('unlocked', false);
			});
			locked.sort();


			this.showChildView('unlockedAchievementsLocation', new Marionette.NextCollectionView({
				className: 'achievement-list',
				collection: unlocked,
				childView: Marionette.View,
				childViewOptions: {
					template: achievementTemplate
				}
			}));

			this.showChildView('lockedAchievementsLocation', new Marionette.NextCollectionView({
				className: 'achievement-list',
				collection: locked,
				childView: Marionette.View,
				childViewOptions: {
					template: achievementTemplate
				}
			}));
		}
	});
});