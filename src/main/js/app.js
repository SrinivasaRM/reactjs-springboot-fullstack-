'use strict';

const React = require('react');
const ReactDOM = require('react-dom')
const when = require('when');
const client = require('./client');

const follow = require('./follow'); // function to hop multiple links by "rel"

const stompClient = require('./websocket-listener');

const root = '/api';

class App extends React.Component {

	constructor(props) {
		super(props);
		this.state = {trackers: [], attributes: [], page: 1, pageSize: 4, links: {}};
		this.updatePageSize = this.updatePageSize.bind(this);
		this.onCreate = this.onCreate.bind(this);
		this.onUpdate = this.onUpdate.bind(this);
		this.onDelete = this.onDelete.bind(this);
		this.onNavigate = this.onNavigate.bind(this);
		this.refreshCurrentPage = this.refreshCurrentPage.bind(this);
		this.refreshAndGoToLastPage = this.refreshAndGoToLastPage.bind(this);
	}

	loadFromServer(pageSize) {
		follow(client, root, [
				{rel: 'trackers', params: {size: pageSize}}]
		).then(trackerCollection => {
			return client({
				method: 'GET',
				path: trackerCollection.entity._links.profile.href,
				headers: {'Accept': 'application/schema+json'}
			}).then(schema => {
				// tag::json-schema-filter[]
				/**
				 * Filter unneeded JSON Schema properties, like uri references and
				 * subtypes ($ref).
				 */
				Object.keys(schema.entity.properties).forEach(function (property) {
					if (schema.entity.properties[property].hasOwnProperty('format') &&
						schema.entity.properties[property].format === 'uri') {
						delete schema.entity.properties[property];
					}
					else if (schema.entity.properties[property].hasOwnProperty('$ref')) {
						delete schema.entity.properties[property];
					}
				});

				this.schema = schema.entity;
				this.links = trackerCollection.entity._links;
				return trackerCollection;
				// end::json-schema-filter[]
			});
		}).then(trackerCollection => {
			this.page = trackerCollection.entity.page;
			return trackerCollection.entity._embedded.trackers.map(tracker =>
					client({
						method: 'GET',
						path: tracker._links.self.href
					})
			);
		}).then(trackerPromises => {
			return when.all(trackerPromises);
		}).done(trackers => {
			this.setState({
				page: this.page,
            	trackers: trackers,
				attributes: Object.keys(this.schema.properties),
				pageSize: pageSize,
				links: this.links
			});
		});
	}

	// tag::on-create[]
	onCreate(newTracker) {
		follow(client, root, ['trackers']).done(response => {
			client({
				method: 'POST',
				path: response.entity._links.self.href,
				entity: newTracker,
				headers: {'Content-Type': 'application/json'}
			})
		})
	}
	// end::on-create[]

	// tag::on-update[]
	onUpdate(tracker, updatedTracker) {
		client({
			method: 'PUT',
			path: tracker.entity._links.self.href,
			entity: updatedTracker,
			headers: {
				'Content-Type': 'application/json',
				'If-Match': tracker.headers.Etag
			}
		}).done(response => {
			/* Let the websocket handler update the state */
		}, response => {
			if (response.status.code === 403) {
				alert('ACCESS DENIED: You are not authorized to update ' +
                    tracker.entity._links.self.href);
			}
			if (response.status.code === 412) {
				alert('DENIED: Unable to update ' + tracker.entity._links.self.href +
					'. Your copy is stale.');
			}
		});
	}
	// end::on-update[]

	// tag::on-delete[]
	onDelete(tracker) {
		client({method: 'DELETE', path: tracker.entity._links.self.href}
		).done(response => {/* let the websocket handle updating the UI */},
		response => {
			if (response.status.code === 403) {
				alert('ACCESS DENIED: You are not authorized to delete ' +
                    tracker.entity._links.self.href);
			}
		});
	}
	// end::on-delete[]

	onNavigate(navUri) {
		client({
			method: 'GET',
			path: navUri
		}).then(trackerCollection => {
			this.links = trackerCollection.entity._links;
			this.page = trackerCollection.entity.page;

			return trackerCollection.entity._embedded.trackers.map(tracker =>
					client({
						method: 'GET',
						path: tracker._links.self.href
					})
			);
		}).then(trackerPromises => {
			return when.all(trackerPromises);
		}).done(trackers => {
			this.setState({
				page: this.page,
            	trackers: trackers,
				attributes: Object.keys(this.schema.properties),
				pageSize: this.state.pageSize,
				links: this.links
			});
		});
	}

	updatePageSize(pageSize) {
		if (pageSize !== this.state.pageSize) {
			this.loadFromServer(pageSize);
		}
	}

	// tag::websocket-handlers[]
	refreshAndGoToLastPage(message) {
		follow(client, root, [{
			rel: 'trackers',
			params: {size: this.state.pageSize}
		}]).done(response => {
			if (response.entity._links.last !== undefined) {
				this.onNavigate(response.entity._links.last.href);
			} else {
				this.onNavigate(response.entity._links.self.href);
			}
		})
	}

	refreshCurrentPage(message) {
		follow(client, root, [{
			rel: 'trackers',
			params: {
				size: this.state.pageSize,
				page: this.state.page.number
			}
		}]).then(trackerCollection => {
			this.links = trackerCollection.entity._links;
			this.page = trackerCollection.entity.page;

			return trackerCollection.entity._embedded.trackers.map(tracker => {
				return client({
					method: 'GET',
					path: tracker._links.self.href
				})
			});
		}).then(trackerPromises => {
			return when.all(trackerPromises);
		}).then(trackers => {
			this.setState({
				page: this.page,
            trackers: trackers,
				attributes: Object.keys(this.schema.properties),
				pageSize: this.state.pageSize,
				links: this.links
			});
		});
	}
	// end::websocket-handlers[]

	// tag::register-handlers[]
	componentDidMount() {
		this.loadFromServer(this.state.pageSize);
		stompClient.register([
			{route: '/topic/newTracker', callback: this.refreshAndGoToLastPage},
			{route: '/topic/updateTracker', callback: this.refreshCurrentPage},
			{route: '/topic/deleteTracker', callback: this.refreshCurrentPage}
		]);
	}
	// end::register-handlers[]

	render() {
		return (
			<div>
				<CreateDialog attributes={this.state.attributes} onCreate={this.onCreate}/>
				<TrackerList page={this.state.page}
				              trackers={this.state.trackers}
							  links={this.state.links}
							  pageSize={this.state.pageSize}
							  attributes={this.state.attributes}
							  onNavigate={this.onNavigate}
							  onUpdate={this.onUpdate}
							  onDelete={this.onDelete}
							  updatePageSize={this.updatePageSize}/>
			</div>
		)
	}
}

class CreateDialog extends React.Component {

	constructor(props) {
		super(props);
		this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleSubmit(e) {
		e.preventDefault();
		var newTracker = {};
		this.props.attributes.forEach(attribute => {
			newTracker[attribute] = ReactDOM.findDOMNode(this.refs[attribute]).value.trim();
		});
		this.props.onCreate(newTracker);
		this.props.attributes.forEach(attribute => {
			ReactDOM.findDOMNode(this.refs[attribute]).value = ''; // clear out the dialog's inputs
		});
		window.location = "#";
	}

	render() {
		var inputs = this.props.attributes.map(attribute =>
				<p key={attribute}>
					<input type="text" placeholder={attribute} ref={attribute} className="field" />
				</p>
		);
		return (
			<div>
				<a href="#createTracker">Create New Case</a>

				<div id="createTracker" className="modalDialog">
					<div>
						<a href="#" title="Close" className="close">X</a>

						<h2>Create New Case</h2>

						<form>
							{inputs}
							<button onClick={this.handleSubmit}>Create</button>
						</form>
					</div>
				</div>
			</div>
		)
	}
}

class UpdateDialog extends React.Component {

	constructor(props) {
		super(props);
		this.handleSubmit = this.handleSubmit.bind(this);
	}

	handleSubmit(e) {
		e.preventDefault();
		var updatedTracker = {};
		this.props.attributes.forEach(attribute => {
			updatedTracker[attribute] = ReactDOM.findDOMNode(this.refs[attribute]).value.trim();
		});
		this.props.onUpdate(this.props.tracker, updatedTracker);
		window.location = "#";
	}

	render() {
		var inputs = this.props.attributes.map(attribute =>
				<p key={this.props.tracker.entity[attribute]}>
					<input type="text" placeholder={attribute}
						   defaultValue={this.props.tracker.entity[attribute]}
						   ref={attribute} className="field" />
				</p>
		);

		var dialogId = "updateTracker-" + this.props.tracker.entity._links.self.href;

		return (
			<div>
				<a href={"#" + dialogId}>Update</a>

				<div id={dialogId} className="modalDialog">
					<div>
						<a href="#" title="Close" className="close">X</a>

						<h2>Update the Case</h2>

						<form>
							{inputs}
							<button onClick={this.handleSubmit}>Update</button>
						</form>
					</div>
				</div>
			</div>
		)
	}

}

class TrackerList extends React.Component {

	constructor(props) {
		super(props);
		this.handleNavFirst = this.handleNavFirst.bind(this);
		this.handleNavPrev = this.handleNavPrev.bind(this);
		this.handleNavNext = this.handleNavNext.bind(this);
		this.handleNavLast = this.handleNavLast.bind(this);
		this.handleInput = this.handleInput.bind(this);
	}

	handleInput(e) {
		e.preventDefault();
		var pageSize = ReactDOM.findDOMNode(this.refs.pageSize).value;
		if (/^[0-9]+$/.test(pageSize)) {
			this.props.updatePageSize(pageSize);
		} else {
			ReactDOM.findDOMNode(this.refs.pageSize).value = pageSize.substring(0, pageSize.length - 1);
		}
	}

	handleNavFirst(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.first.href);
	}

	handleNavPrev(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.prev.href);
	}

	handleNavNext(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.next.href);
	}

	handleNavLast(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.last.href);
	}

	render() {
		var pageInfo = this.props.page.hasOwnProperty("number") ?
			<h3>Tracker(Where is my Stuff) - Page {this.props.page.number + 1} of {this.props.page.totalPages}</h3> : null;

		var trackers = this.props.trackers.map(tracker =>
			<Tracker key={tracker.entity._links.self.href}
					  tracker={tracker}
					  attributes={this.props.attributes}
					  onUpdate={this.props.onUpdate}
					  onDelete={this.props.onDelete}/>
		);

		var navLinks = [];
		if ("first" in this.props.links) {
			navLinks.push(<button key="first" onClick={this.handleNavFirst}>&lt;&lt;</button>);
		}
		if ("prev" in this.props.links) {
			navLinks.push(<button key="prev" onClick={this.handleNavPrev}>&lt;</button>);
		}
		if ("next" in this.props.links) {
			navLinks.push(<button key="next" onClick={this.handleNavNext}>&gt;</button>);
		}
		if ("last" in this.props.links) {
			navLinks.push(<button key="last" onClick={this.handleNavLast}>&gt;&gt;</button>);
		}

		return (
			<div>
				{pageInfo}
				<input ref="pageSize" defaultValue={this.props.pageSize} onInput={this.handleInput}/>
				<table>
					<tbody>
						<tr>
							<th>Customer Name</th>
							<th>Product Name</th>
							<th>Current Status</th>
							<th>Product Owner</th>
							<th></th>
							<th></th>
						</tr>
						{trackers}
					</tbody>
				</table>
				<div>
					{navLinks}
				</div>
			</div>
		)
	}
}

// tag::tracker[]
class Tracker extends React.Component {

	constructor(props) {
		super(props);
		this.handleDelete = this.handleDelete.bind(this);
	}

	handleDelete() {
		this.props.onDelete(this.props.tracker);
	}

	render() {
		return (
			<tr>
				<td>{this.props.tracker.entity.customerName}</td>
				<td>{this.props.tracker.entity.productName}</td>
				<td>{this.props.tracker.entity.currentStatus}</td>
				<td>{this.props.tracker.entity.manager.name}</td>
				<td>
					<UpdateDialog tracker={this.props.tracker}
								  attributes={this.props.attributes}
								  onUpdate={this.props.onUpdate}/>
				</td>
				<td>
					<button onClick={this.handleDelete}>Delete</button>
				</td>
			</tr>
		)
	}
}
// end::tracker[]

ReactDOM.render(
	<App />,
	document.getElementById('react')
)

