define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const Header = require('player/header');
	const template = require('tpl!player/templates/layout.html');
	const errorTemplate = require('tpl!core/templates/errorresponse.html');

	return Marionette.View.extend({
		template: template,

		regions: {
			headerLocation: '#header',
			bodyLocation: '#body'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
			document.title = this.model.get('personaname') + ' - Achievement Chaser';
		},

		onRender: function()
		{
			this.showChildView('headerLocation', new Header({
				model: this.model,
				displayRecentActivity: this.getOption('displayRecentActivity')
			}));
		}
	});
});