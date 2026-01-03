for i in $(seq 1 23); do
  curl -o "$i.png" "https://gateway.pinata.cloud/ipfs/bafybeihbso5n53jblaianewxlwtyg75cszy5aqbfu7fa3otvurzbzprdmi/$i.png"
done
