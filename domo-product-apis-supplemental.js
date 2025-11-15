/* eslint require-atomic-updates: 0 */

const codeengine = require('codeengine');

class Helpers {
	/**
	 * Helper function to handle API requests and errors
	 * @param {string} method - The HTTP method
	 * @param {string} url - The endpoint URL
	 * @param {object} [body=null] - The request body
	 * @param {object} [headers=null] - The request headers
	 * @param {string} [content='application/json'] - Request body content type
	 * @returns {object} The response data
	 * @throws {error} If the request fails
	 */
	static async handleRequest(
		method,
		url,
		body = null,
		headers = null,
		contentType = 'application/json'
	) {
		try {
			return await codeengine.sendRequest(
				method,
				url,
				body,
				headers,
				contentType
			);
		} catch (error) {
			console.error(
				`Error with ${method} request to ${url}\nPayload:\n${JSON.stringify(
					body,
					null,
					2
				)}\nError:\n`,
				error
			);
			throw error;
		}
	}
}

const { handleRequest } = Helpers;

/**
 * Generates a Universally Unique Identifier (UUID)
 *
 * @returns {string} uuid
 */
function generateUUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		var r = (Math.random() * 16) | 0,
			v = c == 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Determine the length of the provided list
 *
 * @param {integer[]} list - The list to get the length of
 * @returns {integer} - The length of the list
 */
function getListOfNumbersLength(list) {
	return list.length;
}

/**
 * Retrieve the number at the specified index in a list
 *
 * @param {integer[]} list - The list of numbers to source from
 * @param {integer} index - The index of the number to get
 * @returns {integer} - The number at the specified index
 */
function getNumberFromList(list, index) {
	return list[index];
}

/**
 * Takes an Epoch timestamp as a number and converts it to datetime
 *
 * @param {integer} epoch - The Epoch timestamp to cast, sent as a number
 * @returns {datetime} - The number at the specified index
 */
function castEpochTimestampNumberAsDatetime(epoch) {
	return new Date(epoch);
}

/**
 * Deletes all cards on a given page then deletes the page
 *
 * @param {string} pageId - integer id of page to delete
 * @returns {boolean} result - true if successful
 */
async function deletePageAndCards(pageId) {
	const page = await handleRequest(
		'GET',
		`/api/content/v3/stacks/${pageId}/cards`
	);

	const cardIds = page.cards.map((card) => card.id).join(',');

	await handleRequest(
		'DELETE',
		`/api/content/v1/cards/bulk?cardIds=${cardIds}`
	);

	await handleRequest('DELETE', `/api/content/v1/pages/${pageId}`);

	return true;
}

/**
 * Deletes/revokes an API access token by ID
 *
 * @param {integer} accessTokenId - ID of the access token
 * @returns {null}
 */
async function deleteAccessToken(accessTokenId) {
	await handleRequest('DELETE', `api/data/v1/accesstokens/${accessTokenId}`);
}

/**
 * Updates users in bulk from arrays of user properties (that's how trigger alerts pass them)
 *
 * @param {string[]} ids - user IDs
 * @param {string[]} names - user display names
 * @param {string[]} titles - user titles
 * @param {string[]} departments - user departments
 * @param {string[]} employeeIds - user employee IDs
 * @param {string[]} employeeNumbers - user employee numbers
 * @param {integer[]} hireDates - user hire dates as epoch timestamps in milliseconds
 * @param {string[]} reportsToIds - user manager IDs
 */
async function bulkUpdateUsersFromArrays(
	ids,
	names,
	titles,
	departments,
	employeeIds,
	employeeNumbers,
	hireDates,
	reportsToIds
) {
	// Build full user object[] first to ensure aligned indices
	const allUsers = ids.map((id, index) => ({
		id,
		displayName: names[index],
		title: titles[index],
		department: departments[index],
		// email: emails[index],
		// alternateEmail: alternateEmails[index],
		// phoneNumber: phoneNumbers[index],
		// deskPhoneNumber: deskPhoneNumbers[index],
		// location: locations[index],
		// timeZone: timeZones[index],
		// locale: locales[index],
		employeeId: employeeIds[index],
		employeeNumber: employeeNumbers[index],
		hireDate: hireDates[index],
		reportsTo: reportsToIds[index]
	}));

	const batchSize = 50;
	for (let i = 0; i < allUsers.length; i += batchSize) {
		const batch = allUsers.slice(i, i + batchSize);
		const body = {
			transactionId: generateUUID(),
			users: batch
		};
		await handleRequest('PUT', 'api/content/v2/users/bulk', body);
	}
}

/**
 * Updates reportsTo field (manager) of a user
 *
 * @param {integer} userId - ID of user to update
 * @param {integer} managerId - ID of the manager user to set as reportsTo
 * @returns {null}
 */
async function updateManager(userId, managerId) {
	const url = `/api/content/v2/users/${userId}/teams`;
	const payload = { reportsTo: [{ userId: managerId }] };
	await handleRequest('POST', url, payload);
}

/**
 * Updates roles for multiple users
 * @param {Person[]} people - The people
 * @param {integer} roleId - The new role
 */
async function bulkUpdateUserRoles(people, roleId) {
	await handleRequest(
		'PUT',
		`/api/authorization/v1/roles/${roleId}/users`,
		people
	);
}

/**
 * Get users that have a grant (or grants by comma separated values)
 *
 * @param {string} grant - grant or grants to search for
 * @returns {object[]} users - Array of users that have that grant
 */
async function getUsersByGrant(grant) {
	const limit = 100;
	let offset = 0;
	let hasMoreData = true;
	let users = [];

	while (hasMoreData) {
		let response = await handleRequest(
			'GET',
			`/api/content/v1/typeahead?type=userByEmail&authorities=${grant}&limit=${limit}&offset=${offset}`
		);
		console.log('Response:', response);
		if (!response || !response.users) {
			throw new Error('Invalid response from getUsersByGrant');
		}
		// Cast id to string for consistency
		response.users.forEach((user) => {
			user.id = user.id.toString();
		});

		users.push(...response.users);
		if (response.users.length < limit) {
			hasMoreData = false;
		}
		offset += limit;
	}
	return users;
}

/**
 * Gets members of a group
 *
 * @param {integer} groupId - ID of the group
 * @returns {object[]} members - Array of users in the group
 */
async function getGroupMembers(groupId) {
	const response = await handleRequest(
		'GET',
		`/api/content/v2/groups/${groupId}/permissions?includeUsers=true`
	);
	let members = response.members.filter((m) => m.type != 'GROUP');
	return members;
}

/**
 * Updates members of a group
 *
 * @param {integer} groupId - ID of the group
 * @param {object[]} addMembers - Array of users to add
 * @param {object[]} removeMembers- Array of users to remove
 * @returns {null}
 */
async function updateGroupMembers(groupId, addMembers, removeMembers) {
	// Ensure both arrays have the correct structure
	addMembers = addMembers.map((m) => ({
		id: m.id,
		type: 'USER'
	}));
	removeMembers = removeMembers.map((m) => ({
		id: m.id,
		type: 'USER'
	}));
	// Filter out removeMembers from addMembers
	addMembers = addMembers.filter(
		(m) => !removeMembers.some((r) => r.id === m.id)
	);
	const body = [
		{
			groupId,
			addMembers,
			removeMembers
		}
	];
	await handleRequest('PUT', '/api/content/v2/groups/access', body);
}

/**
 * Get a user object from a person object
 *
 * @param {Person} person - The person
 * @returns {object} user - Information about the person
 * 	Properties:
 * 	- id {integer}
 *  - displayName {string}
 *  - userName {string}
 *  - emailAddress {string}
 *  - modified {integer}
 *  - created {integer}
 *  - roleId {integer}
 *  - isSystemUser {boolean}
 *  - isActive {boolean}
 */
async function getPerson(person) {
	const response = await handleRequest(
		'GET',
		`api/identity/v1/users/${person}?parts=detailed`
	);
	try {
		const users = response.users;
		const firstUser = users[0];
		const attributes = firstUser.attributes;

		if (!attributes || !attributes.length) return undefined;

		const user = attributes.reduce(
			(map, obj) => ({
				...map,
				[obj.key]: Array.isArray(obj.values) ? obj.values[0] : undefined
			}),
			{}
		);
		return user;
	} catch (error) {
		console.error('Error processing user attributes:', error);
		return undefined;
	}
}

/**
 * Casts a string User ID to a person object
 *
 * @param {string} userId - ID of the user
 * @returns {Person} person - Person object
 */
async function castUserIdToPerson(userId) {
	return userId;
}

/**
 * Casts an integer User ID to a person object
 *
 * @param {integer} userId - ID of the user
 * @returns {Person} person - Person object
 */
async function castUserIdNumToPerson(userId) {
	return userId.toString();
}

/**
 * Casts an array of integer User IDs to an array of person objects
 *
 * @param {string[]} userIds - IDs of the users
 * @returns {Person[]} persons - Array of person objects
 */
async function castUserIdListToPersonList(userIds) {
	return userIds;
}

/**
 * Casts an array of integer User IDs to an array of person objects
 *
 * @param {integer[]} userIds - IDs of the users
 * @returns {Person[]} persons - Array of person objects
 */
async function castUserIdNumListToPersonList(userIds) {
	return userIds.map(String);
}

/**
 * Concatenates a list of numbers into a text string separated by the specified separator
 *
 * @param {integer[]} list - Array of integers
 * @returns {string} concatenatedList - Concatenated string of integers
 */
async function concatNumList(list, separator = ',') {
	return list.join(separator);
}
