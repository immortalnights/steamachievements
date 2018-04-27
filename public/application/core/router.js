define(function(require) {
	var Marionette = require('backbone.marionette');
	var Form = require('core/form');
	var formTemplate = require('tpl!index/templates/form.html');

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
			var Index = Marionette.View.extend({
			});

			var screen = new Marionette.View({
				template: _.template('<div id="playerform" class="" style="margin-top: 10rem"></div><div id="summary"></div>'),

				regions: {
					formLocation: '#playerform',
					summaryLocation: '#summary'
				}
			});

			this.getApp().showScreen(screen);

			var form = new Form({
				template: formTemplate
			});

			var toggleControls = function(show) {

				if (!show)
				{
					// disable the button and show the loader
					this.$('.spinner-layer').fadeIn();
				}
				else
				{
					this.$('.spinner-layer').hide();
				}
			}

			form.once('render', function() {
				var self = this;
				this.$('input').on('input', function() {
					self.$('.alert-danger').fadeOut();
				});
			});

			form.on('serialized', function(formData) {
				var self = this;

				toggleControls.call(this, false);
				this.$('.alert-danger').hide();
				this.$('.preloader-wrapper').fadeIn();

				Backbone.ajax('/api/players', {
					method: 'post',
					data: JSON.stringify(formData),
					contentType: 'application/json'
				})
				.then(function(data, textStatus, xhr) {
					// toggleControls.call(this, false);
					Backbone.history.navigate('#/player/' + encodeURIComponent(data._id), true);
				})
				.fail(function(xhr, textStatus, errorThrown) {

					self.$('.preloader-wrapper').hide();

					var el = self.$('.alert-danger');
					if (xhr && xhr.responseJSON)
					{
						el.text(xhr.responseJSON.error);
					}
					else
					{
						el.text("Failed to find player.");
					}
					el.fadeIn();

					toggleControls.call(self, true);
				});
			})

			screen.showChildView('formLocation', form);
		},

		notFound: function()
		{
			console.warn("Unknown url", Backbone.history.hash);
			Backbone.history.navigate('#/', true);
		}
	});
});