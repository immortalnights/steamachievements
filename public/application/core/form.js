define(function(require) {
	var Marionette = require('backbone.marionette');

	return Marionette.View.extend({
		tagName: 'form',

		events: {
			submit: 'onSubmit'
		},

		initialize: function(options)
		{
			Marionette.View.prototype.initialize.call(this, options);
		},

		onRender: function()
		{
			this.$el.prop('method', 'post');
			this.$el.prop('action', '#');
		},

		onSubmit: function(event)
		{
			event.preventDefault();

			var dataArray = this.$el.serializeArray();
			console.log(dataArray);

			// Generic conversion to JSON object
			var data = {};
			_.each(dataArray, function(obj) {
				data[obj.name] = obj.value;
			});

			this.triggerMethod('serialized', data);
		}
	});
});