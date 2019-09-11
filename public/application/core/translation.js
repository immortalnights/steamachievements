define(function(require) {

	window.tr = function(msg, obj) {
		if (obj)
		{
			// console.log(msg, obj);
			const rexp = new RegExp(/__([a-zA-Z0-9]+)__/g);

			let match;
			let replacements = {};
			while (match = rexp.exec(msg))
			{
				// console.log(msg, match, obj[match[1]]);

				// msg = msg.replace(match[0], obj[match[1]]);
				if (obj[match[1]])
				{
					replacements[match[0]] = obj[match[1]];
				}
				else
				{
					console.warn("Missing key in obj '%s'", match[0]);
				}
			}

			// console.log(replacements);
			_.each(replacements, function(value, key) {
				msg = msg.replace(key, value);
			});

			// console.log(msg);
		}

		return msg;
	}

	return {};
});