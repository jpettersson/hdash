import * as React from 'react';
import { Grid, Navbar, Nav, NavItem, Glyphicon, ButtonGroup, Button } from 'react-bootstrap';
import { PagesContext } from 'api/interfaces';
import { Dashboard, Component, LayoutEntry } from 'api/model';
import { Optional, absent, of } from 'optional';
import ReactGridLayout from 'react-grid-layout';
import EditComponent from 'components/EditComponent';
import Visualization from 'components/Visualization';

const ResponsiveReactGridLayout = ReactGridLayout.WidthProvider(ReactGridLayout);

const ROW_HEIGHT = 150;

interface Props {
  params: {
    id: string
  }
}

interface State {
  locked: boolean;
  dashboard: Optional<Dashboard>;
  editComponent: Optional<string>;
}

export default class DashboardPage extends React.Component<Props, State> {
  context: PagesContext;

  public static contextTypes: any = {
    db: React.PropTypes.object
  };

  constructor(props: Props) {
    super(props);

    this.state = {
      locked: true,
      dashboard: absent<Dashboard>(),
      editComponent: absent<string>()
    };
  }

  public componentDidMount(): void {
    this.context.db.get(this.props.params.id).then(dashboard => {
      this.setState({ dashboard: dashboard });
    });
  }

  private renderLock() {
    return (
      <NavItem onClick={() => this.setState({ locked: true, editComponent: absent<string>() })}>
        <Glyphicon glyph="lock" />
        <span>&nbsp;&nbsp;Lock</span>
      </NavItem>
    );
  }

  private renderUnlock() {
    return (
      <NavItem onClick={() => this.setState({ locked: false })}>
        <Glyphicon glyph="wrench" />
        <span>&nbsp;&nbsp;Unlock to Edit</span>
      </NavItem>
    );
  }

  public render() {
    const {locked, dashboard, editComponent} = this.state;

    let title = dashboard
      .map(dashboard => dashboard.title)
      .orElse(`Dashboard with ID '${this.props.params.id}' does not exist`);

    const lock = locked ? this.renderUnlock() : this.renderLock();

    const plus = !locked ? (
      <NavItem onClick={() => this.addComponent()}>
        <Glyphicon glyph="plus" />
        <span>&nbsp;&nbsp;Add Component</span>
      </NavItem>
    ) : null;

    const save = !locked ? (
      <NavItem onClick={() => this.save()}>
        <Glyphicon glyph="save" />
        <span>&nbsp;&nbsp;Save</span>
      </NavItem>
    ) : null;

    const main = dashboard.map(dashboard => {
      return editComponent.map(componentId => {
        return dashboard.getComponent(componentId).map(component => {
          return <EditComponent component={component} onBack={(component) => this.back(component)} />;
        }).orElseGet(() => {
          return (
            <Grid>
              <h4>No component with ID: {componentId}</h4>
            </Grid>
          );
        });
      }).orElseGet(() => {
        return (
          <Grid fluid={true}>
            <h1>{title}</h1>

            <ResponsiveReactGridLayout
              className="layout"
              draggableHandle=".titlebar"
              layout={dashboard.layout}
              cols={12}
              measureBeforeMount={true}
              onLayoutChange={(layout: any) => this.layoutChanged(layout)}
              rowHeight={ROW_HEIGHT}
              isDraggable={!locked}
              isResizable={!locked}
            >
              {dashboard.components.map(component => {
                const buttons = !locked ? (
                  <div className="pull-right">
                    <div className="buttons">
                      <ButtonGroup bsSize="xs">
                        <Button onClick={() => this.edit(component.id)}>
                          <Glyphicon glyph="edit" />
                        </Button>

                        <Button bsStyle="danger" onClick={() => this.remove(component)}>
                          <Glyphicon glyph="remove" />
                        </Button>
                      </ButtonGroup>
                    </div>
                  </div>
                ) : null;

                const showNav = component.showTitle || !locked;

                const titlebar = showNav ? (
                  <div className={"titlebar" + (!locked ? " draggable" : "")}>
                    <span className="text">{component.title}</span>
                    {buttons}
                  </div>
                ) : null;

                const h = dashboard.getLayout(component.id).map(l => l.h).orElse(2);
                const height = h * ROW_HEIGHT + (showNav ? -36 : 0);

                return <div className={"component" + (showNav ? " visible-titlebar" : "")} key={component.id}>
                  {titlebar}
                  <Visualization height={height} visualization={component.visualization} />
                </div>;
              })}
            </ResponsiveReactGridLayout>
          </Grid>
        );
      });
    }).get();

    return (
      <div>
        <Navbar collapseOnSelect staticTop={true}>
          <Navbar.Collapse>
            <Nav pullRight>
              {lock}
              {plus}
              {save}
            </Nav>
          </Navbar.Collapse>
        </Navbar>

        {main}
      </div>
    );
  }

  private back(component: Component) {
    this.setState((prev, _) => {
      return {
        editComponent: absent<string>(),
        dashboard: prev.dashboard.map(dashboard => {
          return dashboard.withReplacedComponent(component);
        })
      }
    });
  }

  private edit(componentId: string) {
    this.setState({ editComponent: of(componentId) });
  }

  private remove(component: Component) {
    this.setState((prev, _) => {
      return { dashboard: prev.dashboard.map(dashboard => dashboard.withoutComponent(component)) };
    });
  }

  private save() {
    this.state.dashboard.accept(dashboard => {
      this.context.db.save(dashboard);
    })
  }

  private addComponent() {
    this.setState((prev, _) => {
      return { dashboard: prev.dashboard.map(dashboard => dashboard.withNewComponent()) };
    });
  }

  private layoutChanged(layout: Array<LayoutEntry>) {
    this.setState((prev, _) => {
      return { dashboard: prev.dashboard.map(dashboard => dashboard.withLayout(layout)) };
    });
  }
};