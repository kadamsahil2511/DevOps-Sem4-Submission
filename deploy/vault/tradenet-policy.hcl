path "secret/data/tradenet/*" {
  capabilities = ["read"]
}

path "secret/metadata/tradenet/*" {
  capabilities = ["list", "read"]
}
