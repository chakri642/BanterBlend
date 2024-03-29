package main

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"sync"

	// "time"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const port = 8080

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

type Client struct {
	ID        string
	PartnerID string
	Conn      *websocket.Conn
}

var (
	bucket       = []string{}
	clients      = make(map[string]*Client)
	clientsMutex sync.Mutex
)

func main() {
	http.HandleFunc("/ws", handleConnections)
	log.Fatal(http.ListenAndServe(":"+strconv.Itoa(port), nil))
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	fmt.Println("id xyz: ", id)
	// Upgrade initial GET request to a WebSocket
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer ws.Close()

	// Register client
	uuid := uuid.New()
	// use conditional operator
	if id == "" {
		id = uuid.String()
	}
	fmt.Println("id new xyz: ", id)
	client := &Client{ID: id, Conn: ws, PartnerID: "Null"}
	clientsMutex.Lock()
	clients[client.ID] = client
	bucket = append(bucket, client.ID)
	fmt.Println("new client added: ", bucket)
	clientsMutex.Unlock()
	defer func() {
		clientsMutex.Lock()
		delete(clients, client.ID)
		clientsMutex.Unlock()
	}()

	fmt.Println("started")

	// Find a random client to pair with
	fmt.Println("partnerId: ", client.PartnerID)
	makeRandomPair(client.ID)
	// client.PartnerID = partnerId
	// fmt.Println("partnerId: ", client.PartnerID)
	fmt.Println("paired: ", client)

	// Send clientID and partnerID to the client and the paired client
	err = ws.WriteJSON(map[string]string{"id": client.ID, "partnerId": client.PartnerID})
	if err != nil {
		log.Println("Error writing ID:", err)
		return
	}
	if client.PartnerID != "Null" {
		err = clients[client.PartnerID].Conn.WriteJSON(map[string]string{"id": client.PartnerID, "partnerId": client.ID})
		if err != nil {
			log.Println("Error writing ID:", err)
			return
		}
	}

	// Wait for messages from client
	for {
		var message map[string]string
		
		err := ws.ReadJSON(&message)
		fmt.Println("message xyz: ", message)

		if err != nil {
			// disconnect the client and the paired client
			log.Println("Error reading message:", err)
			fmt.Println("disconnecting client: ", client.ID, "partnerId: ", client.PartnerID)


			disconnectClient(client.ID)
			for i, v := range bucket {
				if v == client.ID {
					bucket = append(bucket[:i], bucket[i+1:]...)
					fmt.Println("client removed from bucket: ", bucket)
					break
				}
			}
			for i, v := range bucket {
				if v == client.PartnerID {
					bucket = append(bucket[:i], bucket[i+1:]...)
					fmt.Println("client removed from bucket: ", bucket)
					break
				}
			}
			break
		}

		partnerId := client.PartnerID
		fmt.Println("partnerId: ", partnerId)
		fmt.Println("ckientId: ", client.ID)
		// Forward the message to the paired client
		if partnerId != "Null" {
			forwardMessage(partnerId, message)
		}
	}
}

func makeRandomPair(clientId string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	if len(bucket) <= 1 {
		return
	}

	// rand.Seed(time.Now().UnixNano())
	var (
		partnerIdIndex int
		partnerId      string
	)
	for {
		partnerIdIndex = rand.Intn(len(bucket))
		partnerId = bucket[partnerIdIndex]
		if partnerId != clientId {
			break
		}
	}
	clients[partnerId].PartnerID = clientId
	clients[clientId].PartnerID = partnerId
	for i, v := range bucket {
		if v == partnerId {
			bucket = append(bucket[:i], bucket[i+1:]...)
			fmt.Println("client removed from bucket: ", bucket)
			break
		}
	}
	for i, v := range bucket {
		if v == clientId {
			bucket = append(bucket[:i], bucket[i+1:]...)
			fmt.Println("client removed from bucket: ", bucket)
			break
		}
	}

}

func forwardMessage(partnerId string, message map[string]string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	pair, ok := clients[partnerId]
	if !ok {
		return
	}

	err := pair.Conn.WriteJSON(message)
	if err != nil {
		log.Printf("Error writing message to client %s: %v", partnerId, err)
	}
}


func disconnectClient(clientID string) {
	clientsMutex.Lock()
	defer clientsMutex.Unlock()

	// Close the WebSocket connection
	if client, ok := clients[clientID]; ok {
		if client.Conn != nil {
			// err := client.Conn.WriteJSON(map[string]string{"msg": "disconnected"})
			// if err != nil {
			// 	log.Println("Error writing ID:", err)
			// 	return
			// }
			// err = clients[client.PartnerID].Conn.WriteJSON(map[string]string{"msg": "disconnected"})
			// if err != nil {
			// 	log.Println("Error writing ID:", err)
			// 	return
			// }

			err := client.Conn.Close()
			if err != nil {
				log.Printf("Error closing WebSocket connection for client %s: %v", clientID, err)
			}
		}
		delete(clients, clientID)

		if (client.PartnerID !="Null" && clients[client.PartnerID].Conn != nil) {
			err := clients[client.PartnerID].Conn.Close()
			if err != nil {
				log.Printf("Error closing WebSocket connection for client %s: %v", client.PartnerID, err)
			}
			delete(clients, client.PartnerID)
		}

		fmt.Println("Client disconnected clientId:", clientID, "partnerId: ", client.PartnerID)
	}
}
