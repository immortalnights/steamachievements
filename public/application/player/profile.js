define(function(require) {
	'use strict';

	var Marionette = require('backbone.marionette');
	var Header = require('player/header');
	var template = require('tpl!player/templates/layout.html');
	var errorTemplate = require('tpl!core/templates/errorresponse.html');

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
			this.showChildView('headerLocation', new Header({ model: this.model }));
		}
	});
});