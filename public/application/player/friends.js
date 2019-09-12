define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const Friends = require('player/collections/friends');
	const friendTemplate = require('tpl!player/templates/friend.html');

	return Marionette.View.extend({
		template: _.template('<h5><%- tr("Friends") %></h5><div id="friends"></div><div id="friendsfooter"></div>'),

		regions: {
			friendsLocation: '#friends',
			friendsFooterLocation: '#friendsfooter'
		},

		modelEvents: {
			change: 'render'
		},

		initialize: function(options)
		{
			let player = options.player;
			this.collection = new Friends(null, { playerId: player.id });
			this.model = new Backbone.Model({
				friends: 0
			});

			this.model.listenToOnce(this.collection, 'sync', function(collection) {
				this.set('friends', player.get('friends') - collection.length);
			});

			this.collection.fetch();

			Marionette.View.prototype.initialize.call(this, options);
		},

		onRender: function()
		{
			if (this.collection.isEmpty())
			{
				this.showChildView('friendsLocation', new Marionette.View({
					template: _.template('<p class="center"><%- tr("None of this users __friends__ friend(s) are known. Invite them to join!", obj) %></p>'),
					model: this.model
				}));
			}
			else
			{
				this.showChildView('friendsLocation', new Marionette.NextCollectionView({
					collection: friends,
					tagName: 'ul',
					className: '',
					childView: Marionette.View,
					childViewOptions: {
						tagName: 'li',
						className: 'list-item',
						template: friendTemplate
					}
				}));

				this.showChildView('friendsFooterLocation', new Marionette.View({
					template: _.template('<p class="center"><%- tr("And __friends__ other friend(s), invite them to join!", obj) %></p>'),
					model: this.model
				}));
			}
		}
	});
});
