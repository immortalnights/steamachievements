define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const Layout = require('index/layout');

	return Marionette.AppRouter.extend({
		routes: {
			'': 'index',
			'*notFound': 'notFound'
		},

		initialize: function(options)
		{
			Marionette.AppRouter.prototype.initialize.call(this, options);
		},

		getApp: function()
		{
			return require('application')();
		},

		index: function()
		{
			this.getApp().showScreen(new Layout());
		},

		notFound: function(fragment)
		{
			console.warn("Unknown url '%s'", fragment);
			Backbone.history.navigate('#/', true);
		}
	});
});