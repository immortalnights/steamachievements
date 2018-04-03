define(function(require) {
	var Marionette = require('backbone.marionette');

	return Marionette.NextCollectionView.extend({
		tagName: 'ul',
		className: '',
		childView: Marionette.View,
		childViewOptions: {
			tagName: 'li',
			template: _.template("&lt;missing template&gt;")
		},
		emptyView: Marionette.View,
	});
});