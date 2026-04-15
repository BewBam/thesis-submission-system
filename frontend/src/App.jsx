import { Button, Card, Layout, Select, Space, Typography } from "antd";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const roles = [
  { value: "student", label: "Student" },
  { value: "reviewer", label: "Reviewer" },
  { value: "admin", label: "Admin" }
];

function App() {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ background: "#001529" }}>
        <Title level={4} style={{ color: "#fff", margin: 0, lineHeight: "64px" }}>
          Thesis Deposit Portal - Sprint 1 Skeleton
        </Title>
      </Header>
      <Content style={{ padding: 24 }}>
        <Card title="Login Prototype" style={{ maxWidth: 560 }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Text>Select a role for basic authorization flow testing.</Text>
            <Select options={roles} placeholder="Choose role" />
            <Button type="primary">Login</Button>
          </Space>
        </Card>
      </Content>
    </Layout>
  );
}

export default App;
