require.config({
	baseUrl: '/application',

	paths: {
		'requireLib': '/node_modules/requirejs/require',
		'jquery': '/node_modules/jquery/dist/jquery',
		// 'bootstrap' : "https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0-beta/js/bootstrap.min",
		// 'cookies': '/node_modules/js-cookie/src/js.cookie',
		'underscore': '/node_modules/underscore/underscore',
		'text': '/node_modules/requirejs-text/text',
		'tpl': '/node_modules/requirejs-underscore-tpl/underscore-tpl',
		'backbone': '/node_modules/backbone/backbone',
		'backbone.marionette': '/node_modules/backbone.marionette/lib/backbone.marionette',
		'backbone.radio': '/node_modules/backbone.radio/build/backbone.radio',
		'backbone.poller': '/node_modules/backbone-poller/backbone.poller.min',
		'moment': '/node_modules/moment/min/moment-with-locales.min',
		// 'materialize': '/node_modules/backbone-poller/backbone.poller.min',
		// 'fontawesome': '/node_modules/@fortawesome/fontawesome/index',
		// 'fontawesome-solid': '/node_modules/@fortawesome/fontawesome-free-solid/index',
		// 'fontawesome-regular': '/node_modules/@fortawesome/fontawesome-free-regular/index',
		// 'fontawesome-brands': '/node_modules/@fortawesome/fontawesome-free-brands/index'
	}
});

requirejs(['application', 'jquery', 'underscore',/*'fontawesome', 'fontawesome-solid', 'fontawesome-regular', 'fontawesome-brands'*/], function(application, fa) {
	'use strict';

	var app = application();
	_.defer(app.start.bind(app));
}, function(err) {
	document.getElementsByTagName('body')[0].innerHTML = err;
	console.error(err);
});
