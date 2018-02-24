'use strict';

const debug = require('debug')('steam');
const http = require('http');

module.exports = function(options, responseDataKey) {
	debug("HTTP", options);
	return new Promise(function(resolve, reject) {
		let responseData = '';
		let req = http.request(options, function(response) {

			response.on('data', function(chunk) {
				responseData += chunk;
			});

			response.on('end', function() {
				debug("Request completed");

				// TODO verify response is JSON
				const contentType = response.headers['content-type'] || '';
				if (contentType.startsWith('application/json'))
				{
					let responseJSON;
					try
					{
						debug("Parsing response data");
						responseJSON = JSON.parse(responseData);
						debug("Parsed response data");

						if (responseJSON[responseDataKey])
						{
							if ((this.statusCode >= 200 && this.statusCode < 300) || this.statusCode === 301)
							{
								debug("Completed successfully");
								resolve(responseJSON[responseDataKey]);
							}
							else
							{
								debug("Completed with error; error response", this.statusCode);
								reject(responseJSON[responseDataKey]);
							}
						}
						else
						{
							debug("Completed with error; invalid responseDataKey", Object.keys(responseJSON));
							reject({ error: "Response does not contain object '" + responseDataKey + "'" });
						}
					}
					catch (e)
					{
						reject(e);
					}
				}
				else
				{
					reject("Invalid response\n" + responseData);
				}
			});

			response.on('abort', function() {
				debug("Request aborted");
				reject("Aborted");
			});
		});

		req.on('error', function(response) {
			reject(response);
		});

		req.end();
	});
}
