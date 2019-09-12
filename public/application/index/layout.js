define(function(require) {
	'use strict';

	const Marionette = require('backbone.marionette');
	const Form = require('core/form');
	const formTemplate = require('tpl!index/templates/form.html');

	return Marionette.View.extend({
		template: _.template('<div id="playerform" class="" style="margin-top: 10rem"></div><div id="summary"></div>'),

		regions: {
			formLocation: '#playerform',
			summaryLocation: '#summary'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
		},

		onRender: function()
		{
			const form = new Form({
				template: formTemplate
			});

			const toggleControls = function(show) {
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
				const self = this;
				this.$('input').on('input', function() {
					self.$('.alert-danger').fadeOut();
				});
			});

			form.on('serialized', function(formData) {
				const self = this;

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

					let el = self.$('.alert-danger');
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

			this.showChildView('formLocation', form);
		}
	});
});
