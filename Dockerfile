FROM node:16-alpine

WORKDIR /app

# Instalar as dependências do PostgreSQL
RUN apk add postgresql-client

COPY package*.json ./
RUN npm install

COPY . .

# Executa o script de criação do esquema do banco de dados
RUN psql -h your_db_host -U your_db_user -d your_db_name -f schema.sql

CMD ["npm", "start"]